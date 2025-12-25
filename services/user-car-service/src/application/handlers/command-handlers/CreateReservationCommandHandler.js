// /services/user-car-service/src/application/handlers/command-handlers/CreateReservationCommandHandler.js
import { randomUUID } from "crypto";
import { ReservationAggregate } from "../../../domain/aggregates/ReservationAggregate.js";

export class CreateReservationCommandHandler {
  constructor(eventStore, messageBroker) {
    if (!eventStore || !messageBroker) {
      throw new Error(
        "CreateReservationCommandHandler requires eventStore and messageBroker."
      );
    }
    this.eventStore = eventStore; // 👈 นี่คือ EventStore ที่เรียก RPC
    this.messageBroker = messageBroker;
  }

  async handle(command) {
    // 1. สร้าง ID ใหม่สำหรับการจอง
    const reservationId = randomUUID();

    // 2. สร้าง instance ใหม่ของ Aggregate
    const reservation = new ReservationAggregate(reservationId);

    // 3. สั่ง Aggregate ให้ทำงาน
    // (command ที่รับเข้ามาจาก index.js จะมี userId, slotId, startTime, endTime)
    reservation.createReservation(command);

    // 4. บันทึกและส่ง Event
    const events = reservation.getUncommittedEvents();
    if (events.length > 0) {
      // สำหรับการสร้าง Aggregate ใหม่, expected version (เวอร์ชันปัจจุบันใน DB) คือ 0 เสมอ
      const expectedVersion = 0;

      try {
        // 4.1 บันทึก Event (ซึ่งจะไปเรียก Stored Function ที่เช็ก latest_versions)
        await this.eventStore.saveEvents(
          reservationId,
          "Reservation",
          events,
          expectedVersion
        );

        // 4.2 ส่ง Event ไปที่ Broker (ทำหลังจาก Save สำเร็จ)
        for (const event of events) {
          console.log(`[CreateReservationCommandHandler] Publishing event: ${event.constructor.name}`, JSON.stringify(event));
          await this.messageBroker.publishEvent(event);
        }

        // 4.3 ล้าง Event ที่ยังไม่บันทึกออกจาก Aggregate
        reservation.clearUncommittedEvents();
      } catch (error) {
        // 4.4 ดักจับ Concurrency Error (จาก Stored Function)
        if (
          error.code === "CONCURRENCY_ERROR" ||
          error.message.includes("Concurrency Error")
        ) {
          // โอกาสเกิดตอน Create น้อยมาก (เช่น UUID ชนกัน) แต่ควรมีไว้
          console.error(
            "[CRITICAL] Concurrency error during aggregate creation:",
            error
          );
          throw new Error(
            "Concurrency Error: Failed to create reservation due to potential conflict."
          );
        }
        // โยน Error อื่นๆ ต่อไป
        console.error(
          `[CommandHandler][CreateReservation] Error saving events:`,
          error
        );
        throw error;
      }
    }

    return {
      reservationId: reservationId,
      slotId: command.slotId, // 👈 ส่ง "Time Slot ID" ที่จองได้กลับไปด้วย
      message: "Reservation created successfully.",
    };
  }
}
