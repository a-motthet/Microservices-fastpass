// /services/user-car-service/src/domain/aggregates/ReservationAggregate.js

import { ParkingStatusUpdatedEvent } from "../events/ParkingStatusUpdatedEvent.js";
import { ReservationCreatedEvent } from "../events/ReservationCreatedEvent.js";

/**
 * Represents a parking reservation aggregate.
 */
export class ReservationAggregate {
  constructor(id) {
    if (!id) throw new Error("Aggregate ID is required.");
    this.id = id;
    this.userId = null;
    this.slotId = null;
    this.status = null;
    this.statusCode = null;

    // Vehicle Info
    this.vehicleType = null; // 👈 New State
    this.carId = null;       // 👈 New State

    // Time Components
    this.startTimeStamp = null;
    this.startDateLocal = null;
    this.startTimeLocal = null;
    this.endTimeStamp = null;
    this.endDateLocal = null;
    this.endTimeLocal = null;
    this.timeZoneOffset = null;

    // Location
    this.parkingSiteId = null;
    this.floorId = null;

    this.version = 0;
    this.uncommittedEvents = [];
  }

  createReservation(command) {
    if (this.version > 0) throw new Error("Reservation already exists.");

    // Validate Required Fields
    if (!command.userId || !command.slotId || !command.parkingSiteId || !command.floorId ||
        !command.startDateLocal || !command.startTimeLocal || !command.endDateLocal ||
        !command.endTimeLocal || !command.timeZoneOffset) {
      throw new Error("Missing required reservation details in command.");
    }

    // Validate Time Logic
    const startISO = `${command.startDateLocal}T${command.startTimeLocal}${command.timeZoneOffset}`;
    const endISO = `${command.endDateLocal}T${command.endTimeLocal}${command.timeZoneOffset}`;
    if (new Date(startISO) >= new Date(endISO)) {
      throw new Error("End time must be after start time.");
    }

    // Calculate ReservedAt (Now) components
    const now = new Date();
    const { dateLocal, timeLocal, timeStamp } = getLocalPartsFromDate(now, command.timeZoneOffset);

    // Create Event
    const event = new ReservationCreatedEvent(
      this.id,
      command.userId,
      command.slotId,
      now, // reservedAt (Original Date object)
      
      command.startTimeStamp,
      command.startDateLocal,
      command.startTimeLocal,
      command.endTimeStamp,
      command.endDateLocal,
      command.endTimeLocal,
      command.timeZoneOffset,
      
      command.parkingSiteId,
      command.floorId,
      
      "1", // statusCode
      command.vehicleType,
      command.carId,
      
      dateLocal, // reservedAtDateLocal
      timeLocal, // reservedAtTimeLocal
      timeStamp  // reservedAtTimeStamp
    );

    this._applyAndRecord(event);
  }

  updateStatus(command) {
    if (this.version === 0) throw new Error("Reservation does not exist yet.");
    
    const newStatusCode = getStatusCode(command.newStatus);

    const event = new ParkingStatusUpdatedEvent(
      this.id,
      command.newStatus,
      newStatusCode,
      new Date(),
      this.userId
    );

    this._applyAndRecord(event);
  }

  _applyAndRecord(event) {
    this._apply(event);
    this.uncommittedEvents.push(event);
  }

  _apply(event) {
    let eventType;
    let data;

    if (event instanceof ReservationCreatedEvent || event instanceof ParkingStatusUpdatedEvent) {
      eventType = event.constructor.name;
      data = event;
    } else if (typeof event === "object" && event !== null) {
      if (event.slotId && event.startDateLocal) eventType = "ReservationCreatedEvent";
      else if (event.newStatus) eventType = "ParkingStatusUpdatedEvent";
      else eventType = "UnknownEvent";
      data = event;
    } else {
      return;
    }

    switch (eventType) {
      case "ReservationCreatedEvent":
        this.userId = data.userId;
        this.slotId = data.slotId;
        this.status = data.status || "pending";
        this.statusCode = data.statusCode || "1";
        
        this.parkingSiteId = data.parkingSiteId;
        this.floorId = data.floorId;
        
        this.vehicleType = data.vehicleType || 'car'; // 👈 Update State
        this.carId = data.carId || null;              // 👈 Update State
        
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
        this.statusCode = data.statusCode;
        break;
    }
  }

  getState() {
    return {
      userId: this.userId,
      slotId: this.slotId,
      status: this.status,
      statusCode: this.statusCode,
      
      parkingSiteId: this.parkingSiteId,
      floorId: this.floorId,
      
      vehicleType: this.vehicleType, // 👈 Snapshot
      carId: this.carId,             // 👈 Snapshot
      
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
    const d = snapshotRecord.snapshot_data;
    if (!d) return;
    
    this.userId = d.userId;
    this.slotId = d.slotId;
    this.status = d.status;
    this.statusCode = d.statusCode;
    
    this.parkingSiteId = d.parkingSiteId;
    this.floorId = d.floorId;

    this.vehicleType = d.vehicleType; // 👈 Restore
    this.carId = d.carId;             // 👈 Restore
    
    this.startTimeStamp = d.startTimeStamp;
    this.startDateLocal = d.startDateLocal;
    this.startTimeLocal = d.startTimeLocal;
    this.endTimeStamp = d.endTimeStamp;
    this.endDateLocal = d.endDateLocal;
    this.endTimeLocal = d.endTimeLocal;
    this.timeZoneOffset = d.timeZoneOffset;

    this.version = snapshotRecord.version;
  }

  rehydrateFromEvents(events) {
    if (!events) return;
    events.forEach(e => { this._apply(e); this.version++; });
  }

  getUncommittedEvents() { return this.uncommittedEvents; }
  clearUncommittedEvents() { this.uncommittedEvents = []; }
}

// --- Helper Function ---
function getStatusCode(statusText) {
  const map = {
    'pending': '1',
    'checked_in': '2',
    'checked_out': '3',
    'cancelled': '0'
  };
  return map[statusText] || '99';
}

function getLocalPartsFromDate(dateObj, offsetStr) {
  // offsetStr format: "+07:00" or "-05:30"
  if (!offsetStr) return { dateLocal: null, timeLocal: null, timeStamp: null };

  const sign = offsetStr.startsWith('-') ? -1 : 1;
  const parts = offsetStr.substring(1).split(':');
  const offsetHours = parseInt(parts[0], 10);
  const offsetMinutes = parseInt(parts[1], 10);
  const offsetMs = sign * ((offsetHours * 60) + offsetMinutes) * 60 * 1000;

  const localTimeMs = dateObj.getTime() + offsetMs;
  const localDateObj = new Date(localTimeMs);
  
  const iso = localDateObj.toISOString(); // e.g. 2024-03-20T10:00:00.000Z
  const [dateLocal, timePart] = iso.split('T');
  const timeLocal = timePart.substring(0, 8); // "10:00:00"

  const timeStamp = Math.floor(dateObj.getTime() / 1000).toString();

  return { dateLocal, timeLocal, timeStamp };
}