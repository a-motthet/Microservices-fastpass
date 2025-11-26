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

    // Time Components State (Flat Structure)
    this.startTimeStamp = null;
    this.startDateLocal = null;
    this.startTimeLocal = null;

    this.endTimeStamp = null;
    this.endDateLocal = null;
    this.endTimeLocal = null;

    this.timeZoneOffset = null;

    // Location State
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

    // Validate Required Fields
    if (
      !command.userId ||
      !command.slotId ||
      !command.parkingSiteId ||
      !command.floorId ||
      !command.startDateLocal ||
      !command.startTimeLocal ||
      !command.endDateLocal ||
      !command.endTimeLocal ||
      !command.timeZoneOffset
    ) {
      throw new Error("Missing required reservation details in command.");
    }

    // Validate Logic (Start < End)
    // Construct ISO strings temporarily for comparison
    const startISO = `${command.startDateLocal}T${command.startTimeLocal}${command.timeZoneOffset}`;
    const endISO = `${command.endDateLocal}T${command.endTimeLocal}${command.timeZoneOffset}`;

    if (new Date(startISO) >= new Date(endISO)) {
      throw new Error("End time must be after start time.");
    }
    // --- End Business Rules ---

    // Create Event with Flat Data Structure
    const event = new ReservationCreatedEvent(
      this.id,
      command.userId,
      command.slotId,
      new Date(), // reservedAt (Creation Time)

      // Time Components
      command.startTimeStamp,
      command.startDateLocal,
      command.startTimeLocal,

      command.endTimeStamp,
      command.endDateLocal,
      command.endTimeLocal,

      command.timeZoneOffset,

      // Location
      command.parkingSiteId,
      command.floorId
    );

    this._applyAndRecord(event);
  }

  /**
   * Updates the status of an existing reservation.
   * @param {object} command - The command containing the newStatus.
   */
  updateStatus(command) {
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
      return;
    }

    const event = new ParkingStatusUpdatedEvent(
      this.id,
      command.newStatus,
      new Date(),
      this.userId
    );

    this._applyAndRecord(event);
  }

  // --- Internal State Mutators ---

  _applyAndRecord(event) {
    this._apply(event);
    this.uncommittedEvents.push(event);
  }

  _apply(event) {
    let eventType;
    let data;

    // Check if it's an event instance (New Event)
    if (
      event instanceof ReservationCreatedEvent ||
      event instanceof ParkingStatusUpdatedEvent
    ) {
      eventType = event.constructor.name;
      data = event;
    }
    // Check if it's plain data (Rehydration from Event Store)
    else if (typeof event === "object" && event !== null) {
      if (event.slotId && event.startDateLocal)
        eventType = "ReservationCreatedEvent";
      else if (event.newStatus) eventType = "ParkingStatusUpdatedEvent";
      else eventType = "UnknownEvent";
      data = event;
    } else {
      console.warn(
        `[Aggregate ${this.id}] Invalid event passed to _apply:`,
        event
      );
      return;
    }

    switch (eventType) {
      case "ReservationCreatedEvent":
        this.userId = data.userId;
        this.slotId = data.slotId;
        this.status = data.status || "pending";
        this.parkingSiteId = data.parkingSiteId;
        this.floorId = data.floorId;

        // Update Time Components State
        this.startTimeStamp = data.startTimeStamp;
        this.startDateLocal = data.startDateLocal;
        this.startTimeLocal = data.startTimeLocal;

        this.endTimeStamp = data.endTimeStamp;
        this.endDateLocal = data.endDateLocal;
        this.endTimeLocal = data.endTimeLocal;

        this.timeZoneOffset = data.timeZoneOffset;
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

  getState() {
    return {
      userId: this.userId,
      slotId: this.slotId,
      status: this.status,
      parkingSiteId: this.parkingSiteId,
      floorId: this.floorId,

      // Save Time Components
      startTimeStamp: this.startTimeStamp,
      startDateLocal: this.startDateLocal,
      startTimeLocal: this.startTimeLocal,

      endTimeStamp: this.endTimeStamp,
      endDateLocal: this.endDateLocal,
      endTimeLocal: this.endTimeLocal,

      timeZoneOffset: this.timeZoneOffset,
    };
  }

  rehydrateFromSnapshot(snapshotRecord) {
    const snapshotData = snapshotRecord.snapshot_data;
    if (!snapshotData) return;

    // Restore state
    this.userId = snapshotData.userId;
    this.slotId = snapshotData.slotId;
    this.status = snapshotData.status;
    this.parkingSiteId = snapshotData.parkingSiteId;
    this.floorId = snapshotData.floorId;

    // Restore Time Components
    this.startTimeStamp = snapshotData.startTimeStamp;
    this.startDateLocal = snapshotData.startDateLocal;
    this.startTimeLocal = snapshotData.startTimeLocal;

    this.endTimeStamp = snapshotData.endTimeStamp;
    this.endDateLocal = snapshotData.endDateLocal;
    this.endTimeLocal = snapshotData.endTimeLocal;

    this.timeZoneOffset = snapshotData.timeZoneOffset;

    this.version = snapshotRecord.version;
    console.log(
      `[Aggregate ${this.id}] Rehydrated from snapshot version ${this.version}`
    );
  }

  rehydrateFromEvents(events) {
    if (!events || events.length === 0) return;
    console.log(
      `[Aggregate ${this.id}] Rehydrating with ${
        events.length
      } events starting from version ${this.version + 1}`
    );
    events.forEach((eventData) => {
      this._apply(eventData);
      this.version++;
    });
    console.log(
      `[Aggregate ${this.id}] Finished rehydrating. Final version: ${this.version}`
    );
  }

  getUncommittedEvents() {
    return this.uncommittedEvents;
  }

  clearUncommittedEvents() {
    this.uncommittedEvents = [];
  }
}