// /services/user-car-service/src/application/handlers/command-handlers/CheckInByLicensePlateCommandHandler.js
import { ReservationAggregate } from "../../../domain/aggregates/ReservationAggregate.js";
import { SupabaseSnapshotStore } from "../../../infrastructure/persistence/SupabaseSnapshotStore.js";

export class CheckInByLicensePlateCommandHandler {
  constructor(eventStore, messageBroker, supabaseClient) {
    if (!eventStore || !messageBroker || !supabaseClient) {
      throw new Error(
        "CheckInByLicensePlateCommandHandler requires an event store, message broker, and supabase client."
      );
    }
    this.eventStore = eventStore; // Should be the instance using RPC for saveEvents
    this.messageBroker = messageBroker;
    this.supabase = supabaseClient; // Needed for Read Model query
    this.snapshotStore = new SupabaseSnapshotStore(supabaseClient);
    this.snapshotFrequency = 2; // Snapshot every 2 events for testing
  }

  async handle(command) {
    const { licensePlate } = command;

    // --- Steps 1 & 2: Query Read Models ---
    const { data: car, error: carError } = await this.supabase
      .from("cars")
      .select("user_id")
      .eq("license_plate", licensePlate)
      .single();
    if (carError || !car)
      throw new Error(`License plate "${licensePlate}" not found.`);
    const { user_id } = car;

    const { data: reservationData, error: reservationError } =
      await this.supabase
        .from("reservations")
        .select("id")
        .eq("user_id", user_id)
        .eq("status", "pending")
        .single();
    if (reservationError || !reservationData)
      throw new Error(
        `No active reservation found for license plate "${licensePlate}".`
      );
    const aggregateId = reservationData.id;

    // --- Step 3: Load Aggregate State ---
    const reservation = new ReservationAggregate(aggregateId);
    let expectedVersion = 0; // Version expected *before* applying new command

    const snapshotRecord = await this.snapshotStore.loadSnapshot(aggregateId);
    if (snapshotRecord) {
      reservation.rehydrateFromSnapshot(snapshotRecord);
      expectedVersion = snapshotRecord.version;
      console.log(
        `[CommandHandler][CheckIn] Aggregate ${aggregateId} rehydrated from snapshot version ${expectedVersion}`
      );
    } else {
      console.log(
        `[CommandHandler][CheckIn] No snapshot found for ${aggregateId}. Loading all events.`
      );
    }

    const history = await this.eventStore.getEventsAfterVersion(
      aggregateId,
      expectedVersion
    );
    if (history.length > 0) {
      reservation.rehydrateFromEvents(history);
      expectedVersion = reservation.version; // Update expected version to the latest after rehydration
      console.log(
        `[CommandHandler][CheckIn] Applied ${history.length} events for ${aggregateId}. Final loaded version: ${expectedVersion}`
      );
    } else if (!snapshotRecord) {
      throw new Error(
        `Reservation with ID ${aggregateId} not found (no snapshot or events).`
      );
    }
    // `expectedVersion` now holds the latest known version before the new command

    // --- Step 4: Execute Command ---
    reservation.updateStatus({ newStatus: "checked_in" }); // Apply check-in

    // --- Step 5: Save New Events, Handle Concurrency, Save Snapshot ---
    const newEvents = reservation.getUncommittedEvents();
    if (newEvents.length > 0) {
      const baseVersionForSave = expectedVersion; // Use the version loaded from history/snapshot

      try {
        // 5.1 Save new events (using RPC via EventStore)
        await this.eventStore.saveEvents(
          aggregateId,
          "Reservation",
          newEvents,
          baseVersionForSave // Pass correct expected version to RPC
        );

        // --- Snapshot logic (runs ONLY if saveEvents was successful) ---
        const newVersion = baseVersionForSave + newEvents.length;
        console.log(
          `[CommandHandler][CheckIn] Check snapshot condition: newVersion=${newVersion}, freq=${
            this.snapshotFrequency
          }, condition=${
            newVersion > 0 && newVersion % this.snapshotFrequency === 0
          }`
        );

        if (newVersion > 0 && newVersion % this.snapshotFrequency === 0) {
          console.log(
            `[CommandHandler][CheckIn] Triggering snapshot save for ${aggregateId} at version ${newVersion}`
          );
          try {
            await this.snapshotStore.saveSnapshot(
              aggregateId,
              reservation.getState(), // Get latest state AFTER applying check-in
              newVersion
            );
            console.log(
              `[CommandHandler][CheckIn] Snapshot save successful for ${aggregateId} version ${newVersion}`
            );
          } catch (snapshotError) {
            // Log snapshot error but don't fail the operation
            console.error(
              `[CommandHandler][CheckIn] FAILED TO SAVE SNAPSHOT for ${aggregateId} at version ${newVersion}:`,
              snapshotError
            );
          }
        }
        // --- End Snapshot logic ---

        // 5.3 Publish events (only after successful save)
        for (const event of newEvents) {
          await this.messageBroker.publishEvent(event);
        }

        // 5.4 Clear uncommitted events
        reservation.clearUncommittedEvents();
      } catch (error) {
        // 5.5 Handle Concurrency Error (coming from RPC via EventStore)
        // Check for the custom code/message set in EventStore
        if (
          error.code === "CONCURRENCY_ERROR" ||
          error.message.includes("Concurrency Error")
        ) {
          console.warn(
            `[CommandHandler][CheckIn] Concurrency error caught for aggregate ${aggregateId}. Expected version ${baseVersionForSave}.`
          );
          throw new Error(
            "Concurrency Error: Reservation modified by others, please try again."
          );
        }
        // Re-throw other errors
        console.error(
          `[CommandHandler][CheckIn] Error during save/publish for ${aggregateId}:`,
          error
        );
        throw error;
      }
    } else {
      console.log(
        `[CommandHandler][CheckIn] No new events generated for ${aggregateId}. Skipping save.`
      );
    }

    return {
      message: "Check-in successful",
      reservationId: aggregateId,
      licensePlate: licensePlate,
    };
  }
}
