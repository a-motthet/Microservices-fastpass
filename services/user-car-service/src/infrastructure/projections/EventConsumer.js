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
    this.serviceName = messageBroker.serviceName || "UserCarService"; // ใช้ serviceName จาก messageBroker
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
   * ทำหน้าที่เชื่อมต่อกับ Exchange และเริ่มดักฟังข้อความ
   */
  async start() {
    const channel = this.messageBroker.getChannel();
    if (!channel)
      throw new Error(
        `[EventConsumer][${this.serviceName}] RabbitMQ channel is not available for Consumer.`
      );

    const exchangeName = "events_exchange";

    // 1. ตรวจสอบว่า Exchange มีอยู่จริง (Type: 'fanout')
    await channel.assertExchange(exchangeName, "fanout", {
      durable: true,
    });

    // 2. สร้าง Queue ของตัวเองแบบชั่วคราว (exclusive: true)
    const q = await channel.assertQueue("", { exclusive: true });
    console.log(
      `[EventConsumer][${this.serviceName}] Created exclusive queue: ${q.queue}`
    );

    // 3. นำ Queue ของตัวเองไปผูกกับ Exchange เพื่อรอรับข้อความ
    // routingKey เป็น '' เพราะเป็น fanout
    await channel.bindQueue(q.queue, exchangeName, "");
    console.log(
      `[EventConsumer][${this.serviceName}] Queue ${q.queue} bound to exchange ${exchangeName}`
    );

    // 4. เริ่มดักฟังจาก Queue ของตัวเอง
    channel.consume(
      q.queue,
      async (msg) => {
        if (msg !== null) {
          try {
            const eventMessage = JSON.parse(msg.content.toString());
            console.log(
              `[EventConsumer][${this.serviceName}] Received event: ${eventMessage.event_type} in queue ${q.queue}`
            );

            await this.handleEvent(eventMessage);
            channel.ack(msg);
          } catch (error) {
            console.error(
              `[EventConsumer][${this.serviceName}] Error processing message:`,
              error
            );
            channel.nack(msg, false, false);
          }
        }
      },
      { noAck: false }
    );

    console.log(
      `[EventConsumer][${this.serviceName}] Finished setting up consumer for exchange: ${exchangeName}`
    );
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
