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
    this.status = null;
    this.version = 0; // Version เริ่มต้น
    this.uncommittedEvents = [];
  }

  /**
   * เมธอดสำหรับรับคำสั่งสร้าง Slot
   */
  createSlot(command) {
    // กฎ: ห้ามสร้างซ้ำ (ถ้า version > 0 แสดงว่าถูกสร้างไปแล้ว)
    if (this.version > 0) {
      throw new Error("Slot already exists.");
    }

    // สร้าง Event
    const event = new SlotCreatedEvent(
      this.id,
      command.name,
      command.floor,
      command.details,
      command.parkingSiteId,
      command.floorId
    );

    // อัปเดตสถานะภายในและเก็บ Event ไว้
    this._applyAndRecord(event);
  }

  // (ในอนาคตจะมีเมธอด updateStatus(command) ที่นี่)

  // --- Internal Methods ---

  _applyAndRecord(event) {
    this._apply(event);
    this.uncommittedEvents.push(event);
  }

  /**
   * เมธอดสำหรับเปลี่ยนสถานะภายใน (ห้ามเพิ่ม version ที่นี่)
   * ใช้ทั้งตอนสร้าง Event ใหม่ และตอน Rehydrate
   */
  _apply(event) {
    let eventType;
    let data;

    // ตรวจสอบว่าเป็น Event instance (ตอนสร้างใหม่)
    if (event instanceof SlotCreatedEvent) {
      eventType = event.constructor.name;
      data = event;
    }
    // ตรวจสอบว่าเป็น Plain Object (ตอน Rehydrate)
    else if (typeof event === "object" && event !== null) {
      if (event.slotId && event.name) eventType = "SlotCreatedEvent";
      else eventType = "UnknownEvent";
      data = event;
    } else {
      return; // ไม่รู้จัก Event นี้
    }

    // อัปเดตสถานะตามประเภท Event
    switch (eventType) {
      case "SlotCreatedEvent":
        this.name = data.name;
        this.floor = data.floor;
        this.details = data.details;
        this.parkingSiteId = data.parkingSiteId;
        this.floorId = data.floorId;
        this.status = data.status || "available";
        break;
      // (ในอนาคตจะมี case 'SlotStatusUpdatedEvent': ...)
    }
  }

  // --- Snapshotting Methods (เหมือนกับ Aggregate อื่นๆ) ---

  getState() {
    return {
      name: this.name,
      floor: this.floor,
      details: this.details,
      parkingSiteId: this.parkingSiteId,
      floorId: this.floorId,
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
