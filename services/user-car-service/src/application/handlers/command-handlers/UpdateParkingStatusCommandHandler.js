// /services/user-car-service/src/application/handlers/command-handlers/UpdateParkingStatusCommandHandler.js

import { ReservationAggregate } from "../../../domain/aggregates/ReservationAggregate.js";
import { SupabaseSnapshotStore } from "../../../infrastructure/persistence/SupabaseSnapshotStore.js";

export class UpdateParkingStatusCommandHandler {
  constructor(eventStore, messageBroker, supabaseClient) {
    if (!eventStore || !messageBroker || !supabaseClient) {
      throw new Error(
        "UpdateParkingStatusCommandHandler requires an event store, message broker, and supabase client."
      );
    }
    this.eventStore = eventStore; // Should be the instance using RPC for saveEvents
    this.messageBroker = messageBroker;
    this.snapshotStore = new SupabaseSnapshotStore(supabaseClient);
    this.snapshotFrequency = 2; // Snapshot every 2 events for testing
  }

  async handle(command) {
    const aggregateId = command.reservationId;
    const reservation = new ReservationAggregate(aggregateId);
    let expectedVersion = 0; // Version expected *before* applying new command

    // --- 1. Load Aggregate State (Snapshot + Events) ---
    const snapshotRecord = await this.snapshotStore.loadSnapshot(aggregateId);
    if (snapshotRecord) {
      reservation.rehydrateFromSnapshot(snapshotRecord);
      expectedVersion = snapshotRecord.version; // Start from snapshot version
      console.log(
        `[CommandHandler] Aggregate ${aggregateId} rehydrated from snapshot version ${expectedVersion}`
      );
    } else {
      console.log(
        `[CommandHandler] No snapshot found for ${aggregateId}. Loading all events.`
      );
      // expectedVersion remains 0 if no snapshot
    }

    // Load events that occurred *after* the snapshot version (or all if no snapshot)
    const history = await this.eventStore.getEventsAfterVersion(
      aggregateId,
      expectedVersion
    );
    if (history.length > 0) {
      reservation.rehydrateFromEvents(history);
      // The aggregate's version is now the LATEST known version
      expectedVersion = reservation.version;
      console.log(
        `[CommandHandler] Applied ${history.length} events after snapshot/start for ${aggregateId}. Final loaded version: ${expectedVersion}`
      );
    } else if (!snapshotRecord) {
      // Only throw if NO snapshot AND NO events were found
      throw new Error(
        `Reservation with ID ${aggregateId} not found (no snapshot or events).`
      );
    }
    // At this point, `expectedVersion` holds the latest version of the aggregate *before* the new command

    // --- 2. Execute Command ---
    reservation.updateStatus(command); // This generates new uncommittedEvents

    // --- 3. Save New Events, Handle Concurrency, Save Snapshot ---
    const newEvents = reservation.getUncommittedEvents();
    if (newEvents.length > 0) {
      // The version we expect the database to be at *before* saving new events
      const baseVersionForSave = expectedVersion;

      try {
        // 3.1 Save new events (using RPC which checks latest_versions)
        await this.eventStore.saveEvents(
          aggregateId,
          "Reservation",
          newEvents,
          baseVersionForSave // Pass the correct expected version to the RPC function
        );

        // --- Snapshot logic (runs ONLY if saveEvents was successful) ---
        const newVersion = baseVersionForSave + newEvents.length;
        console.log(
          `[CommandHandler] Check snapshot condition: newVersion=${newVersion}, freq=${
            this.snapshotFrequency
          }, condition=${
            newVersion > 0 && newVersion % this.snapshotFrequency === 0
          }`
        );

        if (newVersion > 0 && newVersion % this.snapshotFrequency === 0) {
          console.log(
            `[CommandHandler] Triggering snapshot save for ${aggregateId} at version ${newVersion}`
          );
          try {
            await this.snapshotStore.saveSnapshot(
              aggregateId,
              reservation.getState(), // Get latest state AFTER applying new event
              newVersion
            );
            console.log(
              `[CommandHandler] Snapshot save successful for ${aggregateId} version ${newVersion}`
            );
          } catch (snapshotError) {
            // Log snapshot error but don't fail the whole operation
            console.error(
              `[CommandHandler] FAILED TO SAVE SNAPSHOT for ${aggregateId} at version ${newVersion}:`,
              snapshotError
            );
          }
        }
        // --- End Snapshot logic ---

        // 3.3 Publish events (only after successful save)
        for (const event of newEvents) {
          await this.messageBroker.publishEvent(event);
        }

        // 3.4 Clear uncommitted events from aggregate
        reservation.clearUncommittedEvents();
      } catch (error) {
        // 3.5 Handle Concurrency Error (coming from the RPC via EventStore)
        // Check for the custom code/message we set in EventStore
        if (
          error.code === "CONCURRENCY_ERROR" ||
          error.message.includes("Concurrency Error")
        ) {
          console.warn(
            `[CommandHandler] Concurrency error caught for aggregate ${aggregateId}. Expected version ${baseVersionForSave}.`
          );
          throw new Error(
            "Concurrency Error: Data modified by others, please reload and try again."
          );
        }
        // Re-throw other errors (e.g., database connection issues)
        console.error(
          `[CommandHandler] Error during save/publish for ${aggregateId}:`,
          error
        );
        throw error;
      }
    } else {
      console.log(
        `[CommandHandler] No new events generated for ${aggregateId}. Skipping save.`
      );
    }

    console.log(
      `[CommandHandler] Successfully handled UpdateParkingStatusCommand for ${aggregateId}`
    );
  }
}
