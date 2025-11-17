// /services/user-car-service/src/domain/aggregates/ReservationAggregate.js

import { ParkingStatusUpdatedEvent } from "../events/ParkingStatusUpdatedEvent.js";
import { ReservationCreatedEvent } from "../events/ReservationCreatedEvent.js";

/**
 * Represents a parking reservation aggregate.
 * Manages the state and business logic related to a single reservation.
 */
export class ReservationAggregate {
  constructor(id) {
    if (!id) {
      throw new Error("Aggregate ID is required.");
    }
    this.id = id;
    this.userId = null;
    this.slotId = null;
    this.status = null; // Represents the *current* state
    this.startTime = null;
    this.endTime = null;
    this.version = 0; // Starts at 0 for a new aggregate
    this.uncommittedEvents = []; // Stores events not yet persisted
  }

  /**
   * Creates a new reservation. Called by the CreateReservationCommandHandler.
   * @param {object} command - The CreateReservationCommand containing details.
   */
  createReservation(command) {
    // --- Business Rules ---
    if (this.status !== null) {
      throw new Error("Reservation already exists.");
    }
    if (
      !command.userId ||
      !command.slotId ||
      !command.startTime ||
      !command.endTime
    ) {
      throw new Error("Missing required reservation details in command.");
    }
    if (new Date(command.startTime) >= new Date(command.endTime)) {
      throw new Error("End time must be after start time.");
    }
    // --- End Business Rules ---

    const event = new ReservationCreatedEvent(
      this.id,
      command.userId,
      command.slotId,
      new Date(), // reservedAt timestamp
      command.startTime,
      command.endTime
    );

    this._apply(event); // Apply the state change
    this.uncommittedEvents.push(event); // Add to the list of changes
  }

  /**
   * Updates the status of an existing reservation. Called by relevant Command Handlers.
   * @param {object} command - The command containing the newStatus.
   */
  updateStatus(command) {
    // --- Business Rules ---
    if (this.status === null) {
      // Check added based on previous error
      throw new Error("Reservation does not exist yet. Cannot update status.");
    }
    if (this.status === "checked_out" || this.status === "cancelled") {
      throw new Error(
        `Cannot update status from the current status: ${this.status}.`
      );
    }
    if (this.status === command.newStatus) {
      console.warn(
        `[Aggregate ${this.id}] Status is already ${this.status}. No change applied.`
      );
      return; // No need to create an event if status is the same
    }
    // --- End Business Rules ---

    const event = new ParkingStatusUpdatedEvent(
      this.id,
      command.newStatus,
      new Date(), // updatedAt timestamp
      this.userId // Include userId in the event
    );

    this._apply(event); // Apply the state change
    this.uncommittedEvents.push(event); // Add to the list of changes
  }

  /**
   * Internal method to apply state changes based on an event.
   * This is used both when creating new events and when rehydrating from history.
   * It should NOT increment the version during rehydration.
   * @param {object} event - Either an event instance or plain event data from the store.
   */
  _apply(event) {
    let eventType;
    let data;

    // Check if it's an event instance (new event)
    if (
      event instanceof ReservationCreatedEvent ||
      event instanceof ParkingStatusUpdatedEvent
    ) {
      eventType = event.constructor.name;
      data = event;
    }
    // Check if it's plain data (rehydration)
    else if (typeof event === "object" && event !== null) {
      // Infer type from properties (adjust if event structure differs)
      if (event.slotId && event.startTime && event.endTime)
        eventType = "ReservationCreatedEvent";
      else if (event.newStatus) eventType = "ParkingStatusUpdatedEvent";
      else eventType = "UnknownEvent";
      data = event; // Data is the event object itself in this case
    } else {
      console.warn(
        `[Aggregate ${this.id}] Invalid event type passed to _apply:`,
        event
      );
      return; // Cannot apply
    }

    console.log(
      `[Aggregate ${this.id}] Applying event: ${eventType} with data:`,
      data
    );

    switch (eventType) {
      case "ReservationCreatedEvent":
        this.userId = data.userId;
        this.slotId = data.slotId;
        this.status = data.status || "pending"; // Crucial: Set status
        this.startTime = data.startTime;
        this.endTime = data.endTime;
        break;
      case "ParkingStatusUpdatedEvent":
        this.status = data.newStatus;
        break;
      default:
        console.warn(
          `[Aggregate ${this.id}] Unhandled event type in _apply: ${eventType}`
        );
    }
    console.log(
      `[Aggregate ${this.id}] State after apply: status=${this.status}, version=${this.version}`
    );
  }

  // --- Snapshotting Methods ---

  /**
   * Gets the current state object for snapshotting.
   * @returns {object} A plain object representing the aggregate's current state.
   */
  getState() {
    return {
      // id: this.id, // ID is the key, usually not stored redundantly inside
      userId: this.userId,
      slotId: this.slotId,
      status: this.status,
      startTime: this.startTime,
      endTime: this.endTime,
      // Version is stored on the snapshot record itself, not within the data blob
    };
  }

  /**
   * Initializes the aggregate state from a loaded snapshot record.
   * @param {object} snapshotRecord - The record from the 'snapshots' table { aggregate_id, snapshot_data, version, created_at }.
   */
  rehydrateFromSnapshot(snapshotRecord) {
    const snapshotData = snapshotRecord.snapshot_data;
    if (!snapshotData) return; // Should not happen but safety check

    // Restore state from snapshot data
    // this.id = snapshotRecord.aggregate_id; // Already set in constructor
    this.userId = snapshotData.userId;
    this.slotId = snapshotData.slotId;
    this.status = snapshotData.status;
    this.startTime = snapshotData.startTime;
    this.endTime = snapshotData.endTime;

    // Set the version based on the snapshot record's version
    this.version = snapshotRecord.version;
    console.log(
      `[Aggregate ${this.id}] Rehydrated from snapshot version ${this.version}`
    );
  }

  /**
   * Applies events loaded from the event store that occurred after the snapshot.
   * @param {Array<object>} events - An array of event data objects.
   */
  rehydrateFromEvents(events) {
    if (!events || events.length === 0) return;

    console.log(
      `[Aggregate ${this.id}] Rehydrating with ${events.length} events after version ${this.version}`
    );
    events.forEach((eventData) => {
      this._apply(eventData); // Apply state changes from the event
      this.version++; // Increment version for each replayed event
    });
    console.log(
      `[Aggregate ${this.id}] Finished rehydrating from events. Final version: ${this.version}`
    );
  }

  // --- End Snapshotting Methods ---

  /**
   * Gets the list of events that have occurred but not yet been saved.
   * @returns {Array<object>} An array of event instances.
   */
  getUncommittedEvents() {
    return this.uncommittedEvents;
  }

  /**
   * Clears the list of uncommitted events (usually called after saving).
   */
  clearUncommittedEvents() {
    this.uncommittedEvents = [];
  }
}
