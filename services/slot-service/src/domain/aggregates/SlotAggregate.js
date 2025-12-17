// /services/slot-service/src/domain/aggregates/SlotAggregate.js

import { SlotCreatedEvent } from "../events/SlotCreatedEvent.js";
// (ในอนาคตจะมี SlotStatusUpdatedEvent ฯลฯ)

export class SlotAggregate {
  constructor(id) {
    if (!id) throw new Error("Aggregate ID is required.");
    this.id = id;
    this.name = null;
    this.floor = null;
    this.details = null;
    this.parkingSiteId = null;
    this.floorId = null;
    this.slotNumber = null; // 👈 New State
    this.vehicleType = null; // 👈 New State
    this.zoneId = null;      // 👈 New State
    this.status = null;
    this.version = 0;
    this.uncommittedEvents = [];
  }

  /**
   * เมธอดสำหรับรับคำสั่งสร้าง Slot
   */
  createSlot(command) {
    if (this.version > 0) {
      throw new Error("Slot already exists.");
    }

    const event = new SlotCreatedEvent(
      this.id,
      command.name,
      command.floor,
      command.details,
      command.parkingSiteId,
      command.floorId,
      command.slotNumber, // 👈 Pass
      command.vehicleType, // 👈 Pass
      command.zoneId      // 👈 Pass
    );

    this._applyAndRecord(event);
  }

  // ... (updateStatus would go here)

  _applyAndRecord(event) {
    this._apply(event);
    this.uncommittedEvents.push(event);
  }

  _apply(event) {
    let eventType;
    let data;

    if (event instanceof SlotCreatedEvent) {
      eventType = event.constructor.name;
      data = event;
    } else if (typeof event === "object" && event !== null) {
      if (event.slotId && event.name) eventType = "SlotCreatedEvent";
      else eventType = "UnknownEvent";
      data = event;
    } else {
      return;
    }

    switch (eventType) {
      case "SlotCreatedEvent":
        this.name = data.name;
        this.floor = data.floor;
        this.details = data.details;
        this.parkingSiteId = data.parkingSiteId;
        this.floorId = data.floorId;
        this.slotNumber = data.slotNumber; // 👈 Update State
        this.vehicleType = data.vehicleType || 'car'; // 👈 Update State
        this.zoneId = data.zoneId;         // 👈 Update State
        this.status = data.status || "available";
        break;
    }
  }

  getState() {
    return {
      name: this.name,
      floor: this.floor,
      details: this.details,
      parkingSiteId: this.parkingSiteId,
      floorId: this.floorId,
      slotNumber: this.slotNumber, // 👈 Snapshot
      vehicleType: this.vehicleType, // 👈 Snapshot
      zoneId: this.zoneId,         // 👈 Snapshot
      status: this.status,
    };
  }

  rehydrateFromSnapshot(snapshotRecord) {
    const data = snapshotRecord.snapshot_data;
    if (!data) return;
    this.name = data.name;
    this.floor = data.floor;
    this.details = data.details;
    this.parkingSiteId = data.parkingSiteId;
    this.floorId = data.floorId;
    this.slotNumber = data.slotNumber; // 👈 Restore
    this.vehicleType = data.vehicleType; // 👈 Restore
    this.zoneId = data.zoneId;         // 👈 Restore
    this.status = data.status;
    this.version = snapshotRecord.version;
    console.log(
      `[Aggregate ${this.id}] Rehydrated from snapshot version ${this.version}`
    );
  }

  rehydrateFromEvents(events) {
    if (!events || events.length === 0) return;
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
