// /services/slot-service/src/application/handlers/command-handlers/CreateSlotCommandHandler.js
import { randomUUID } from "crypto";
import { SlotAggregate } from "../../../domain/aggregates/SlotAggregate.js";

export class CreateSlotCommandHandler {
  constructor(eventStore, messageBroker) {
    if (!eventStore || !messageBroker) {
      throw new Error(
        "CreateSlotCommandHandler requires eventStore and messageBroker."
      );
    }
    this.eventStore = eventStore;
    this.messageBroker = messageBroker;
  }

  async handle(command) {
    // 1. สร้าง ID ใหม่สำหรับ Slot
    const slotId = randomUUID();

    // 2. สร้าง Aggregate instance
    const slotAggregate = new SlotAggregate(slotId);

    // 3. สั่ง Aggregate ให้ทำงาน
    slotAggregate.createSlot(command);

    // 4. บันทึกและส่ง Event (เหมือนกับ Handler อื่นๆ)
    const events = slotAggregate.getUncommittedEvents();
    if (events.length > 0) {
      const expectedVersion = 0; // สำหรับการสร้างใหม่
      try {
        await this.eventStore.saveEvents(
          slotAggregate.id,
          "Slot", // Aggregate Type
          events,
          expectedVersion
        );

        for (const event of events) {
          await this.messageBroker.publishEvent(event);
        }
        slotAggregate.clearUncommittedEvents();
      } catch (error) {
        // ดักจับ Concurrency Error (ถึงแม้โอกาสเกิดตอน Create จะน้อย)
        if (
          error.code === "CONCURRENCY_ERROR" ||
          error.message.includes("Concurrency Error")
        ) {
          console.error(
            "[SlotSvc] Concurrency error during slot creation:",
            error
          );
          throw new Error("Concurrency Error: Failed to create slot.");
        }
        console.error(`[SlotSvc] Error creating slot:`, error);
        throw new Error("Failed to create slot.");
      }
    }
    return { slotId: slotId, message: "Slot created successfully." };
  }
}
