// src/projections/EventConsumer.js

import { ReservationProjection } from "./ReservationProjection.js";
import { UserProjection } from "./UserProjection.js";
import { ReservationHistoryProjection } from "./ReservationHistoryProjection.js";

export class EventConsumer {
  /**
   * @param {object} supabaseClient - Instance ของ Supabase client
   * @param {object} messageBroker - Instance ของ RabbitMQAdapter
   */
  constructor(supabaseClient, messageBroker) {
    this.supabase = supabaseClient;
    this.messageBroker = messageBroker; // รับ messageBroker เข้ามาเพื่อใช้งาน
    this.reservationProjection = new ReservationProjection(this.supabase);
    this.userProjection = new UserProjection(this.supabase);
    this.reservationHistoryProjection = new ReservationHistoryProjection(
      this.supabase
    );

    // ผูก `this` ให้กับเมธอด handleEvent เพื่อให้เรียกใช้ใน context ที่ถูกต้อง
    this.handleEvent = this.handleEvent.bind(this);
  }

  /**
   * เมธอดหลักที่ใช้เริ่มต้นการทำงานของ Consumer
   * ทำหน้าที่เชื่อมต่อกับ Queue และเริ่มดักฟังข้อความ
   */
  async start() {
    const channel = this.messageBroker.getChannel();
    if (!channel)
      throw new Error("RabbitMQ channel is not available for Consumer.");

    const queueName = "events_queue";

    await channel.assertQueue(queueName, { durable: true });
    console.log(`[EventConsumer] Asserted queue: ${queueName}`); // Log เดิม

    // --- 🔽 Log เพิ่มเติมจุดที่ 1 🔽 ---
    console.log(
      `[EventConsumer] About to call channel.consume for queue: ${queueName}`
    );
    // --- 🔼 สิ้นสุด Log เพิ่มเติม 🔼 ---

    channel.consume(queueName, async (msg) => {
      // --- 🔽 Log เพิ่มเติมจุดที่ 2 🔽 ---
      console.log(
        `[EventConsumer] Message received (raw): ${
          msg ? "Got a message!" : "Received NULL message"
        }`
      );
      // --- 🔼 สิ้นสุด Log เพิ่มเติม 🔼 ---

      if (msg !== null) {
        try {
          const eventMessage = JSON.parse(msg.content.toString());
          console.log(
            `[EventConsumer] Received event: ${eventMessage.event_type}`
          ); // Log เดิม

          await this.handleEvent(eventMessage);
          channel.ack(msg);
        } catch (error) {
          console.error("[EventConsumer] Error processing message:", error);
          channel.nack(msg, false, false);
        }
      } else {
        console.warn("[EventConsumer] Received a NULL message from RabbitMQ.");
      }
    });

    console.log(
      `[EventConsumer] Finished setting up consumer for queue: ${queueName}`
    ); // Log เดิม (อาจเปลี่ยนข้อความเล็กน้อย)
  }

  /**
   * เมธอดสำหรับแยกประเภท Event และส่งต่อไปยัง Projection ที่ถูกต้อง
   * @param {object} eventMessage - ข้อความ Event ที่ได้รับมา
   */
  async handleEvent(eventMessage) {
    // โค้ดส่วนนี้ยังคงเหมือนเดิม
    const { event_type, event_data } = eventMessage;

    switch (event_type) {
      case "UserCreatedEvent":
        await this.userProjection.handleUserCreated(event_data);
        break;

      case "ParkingStatusUpdatedEvent":
        await this.reservationProjection.handleParkingStatusUpdated(event_data);
        await this.reservationHistoryProjection.handleReservationEvent(
          eventMessage
        );
        break;

      case "ReservationCreatedEvent":
        await this.reservationProjection.handleReservationCreated(event_data);
        await this.reservationHistoryProjection.handleReservationEvent(
          eventMessage
        );
        break;

      default:
        console.warn(
          `[EventConsumer] No handler for event type: ${event_type}`
        );
    }
  }
}
