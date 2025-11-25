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
    this.status = null;
    
    // Start Time Components
    this.startTimeStamp = null;
    this.startDateLocal = null;
    this.startTimeLocal = null;
    
    // End Time Components
    this.endTimeStamp = null;
    this.endDateLocal = null;
    this.endTimeLocal = null;
    
    // Timezone
    this.timeZoneOffset = null;
    
    this.parkingSiteId = null;
    this.floorId = null;
    this.version = 0;
    this.uncommittedEvents = [];
  }

  /**
   * Creates a new reservation. Called by the CreateReservationCommandHandler.
   * @param {object} command - The CreateReservationCommand containing details.
   */
  createReservation(command) {
    // --- Business Rules ---
    if (this.version > 0) {
      throw new Error("Reservation already exists.");
    }
    if (
      !command.userId ||
      !command.slotId ||
      !command.startDateLocal ||
      !command.startTimeLocal ||
      !command.endDateLocal ||
      !command.endTimeLocal ||
      !command.timeZoneOffset ||
      !command.parkingSiteId ||
      !command.floorId
    ) {
      throw new Error("Missing required reservation details in command.");
    }
    
    // Validate time logic
    const startDate = new Date(`${command.startDateLocal}T${command.startTimeLocal}${command.timeZoneOffset}`);
    const endDate = new Date(`${command.endDateLocal}T${command.endTimeLocal}${command.timeZoneOffset}`);
    
    if (startDate >= endDate) {
      throw new Error("End time must be after start time.");
    }
    // --- End Business Rules ---

    const createdAt = Math.floor(Date.now() / 1000); // Unix timestamp in seconds

    const event = new ReservationCreatedEvent(
      this.id,
      command.userId,
      command.slotId,
      command.startTimeStamp || Math.floor(startDate.getTime() / 1000),
      command.startDateLocal,
      command.startTimeLocal,
      command.endTimeStamp || Math.floor(endDate.getTime() / 1000),
      command.endDateLocal,
      command.endTimeLocal,
      command.timeZoneOffset,
      createdAt,
      command.parkingSiteId,
      command.floorId
    );

    this._applyAndRecord(event);
  }

  /**
   * Updates the status of an existing reservation. Called by relevant Command Handlers.
   * @param {object} command - The command containing the newStatus.
   */
  updateStatus(command) {
    // --- Business Rules ---
    if (this.version === 0) {
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

    this._applyAndRecord(event);
  }

  // --- Internal State Mutators ---

  /** Helper to apply event and add to uncommitted list */
  _applyAndRecord(event) {
    this._apply(event); // Apply state change
    this.uncommittedEvents.push(event); // Record event
    // DO NOT increment version here for new events yet.
    // Version will be incremented by the Command Handler after successful save.
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
      // Infer type from properties
      if (event.slotId && event.startDateLocal)
        eventType = "ReservationCreatedEvent";
      else if (event.newStatus) eventType = "ParkingStatusUpdatedEvent";
      else eventType = "UnknownEvent";
      data = event; // Data is the event object itself in this case
    } else {
      console.warn(
        `[Aggregate ${this.id}] Invalid event passed to _apply:`,
        event
      );
      return; // Cannot apply
    }

    // console.log(`[Aggregate ${this.id}] Applying event: ${eventType}`);

    switch (eventType) {
      case "ReservationCreatedEvent":
        this.userId = data.userId;
        this.slotId = data.slotId;
        this.status = data.status || "pending";
        
        // Store as composite components
        this.startTimeStamp = data.startTimeStamp;
        this.startDateLocal = data.startDateLocal;
        this.startTimeLocal = data.startTimeLocal;
        
        this.endTimeStamp = data.endTimeStamp;
        this.endDateLocal = data.endDateLocal;
        this.endTimeLocal = data.endTimeLocal;
        
        this.timeZoneOffset = data.timeZoneOffset;
        
        this.parkingSiteId = data.parkingSiteId; 
        this.floorId = data.floorId; 
        break;
      case "ParkingStatusUpdatedEvent":
        this.status = data.newStatus;
        break;
      default:
        console.warn(
          `[Aggregate ${this.id}] Unhandled event type in _apply: ${eventType}`
        );
    }
  }

  // --- Snapshotting Methods ---

  /**
   * Gets the current state object for snapshotting.
   * @returns {object} A plain object representing the aggregate's current state.
   */
  getState() {
    return {
      userId: this.userId,
      slotId: this.slotId,
      status: this.status,
      
      // Time as composite components
      startTimeStamp: this.startTimeStamp,
      startDateLocal: this.startDateLocal,
      startTimeLocal: this.startTimeLocal,
      
      endTimeStamp: this.endTimeStamp,
      endDateLocal: this.endDateLocal,
      endTimeLocal: this.endTimeLocal,
      
      timeZoneOffset: this.timeZoneOffset,
      
      parkingSiteId: this.parkingSiteId,
      floorId: this.floorId,
      // Version is stored on the snapshot record itself
    };
  }

  /**
   * Initializes the aggregate state from a loaded snapshot record.
   * @param {object} snapshotRecord - The record from the 'snapshots' table.
   */
  rehydrateFromSnapshot(snapshotRecord) {
    const snapshotData = snapshotRecord.snapshot_data;
    if (!snapshotData) return;

    this.timeZoneOffset = snapshotData.timeZoneOffset;
    
    this.parkingSiteId = snapshotData.parkingSiteId;
    this.floorId = snapshotData.floorId;

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
      `[Aggregate ${this.id}] Rehydrating with ${
        events.length
      } events starting from version ${this.version + 1}`
    );
    events.forEach((eventData) => {
      this._apply(eventData); // Apply state changes from the event
      this.version++; // Increment version for EACH replayed event
    });
    console.log(
      `[Aggregate ${this.id}] Finished rehydrating. Final version: ${this.version}`
    );
  }

  // --- Accessors ---

  getUncommittedEvents() {
    return this.uncommittedEvents;
  }

  clearUncommittedEvents() {
    this.uncommittedEvents = [];
  }
}