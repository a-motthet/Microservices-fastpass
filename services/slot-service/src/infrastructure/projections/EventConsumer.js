// /services/slot-service/src/projections/EventConsumer.js

import { SlotProjection } from "./SlotProjection.js";
// (ไม่จำเป็นต้องใช้ UserProjection)

export class EventConsumer {
  /**
   * @param {object} supabaseClient - Instance ของ Supabase client
   * @param {object} messageBroker - Instance ของ RabbitMQAdapter
   */
  constructor(supabaseClient, messageBroker) {
    if (!supabaseClient || !messageBroker) {
      throw new Error(
        "EventConsumer requires supabaseClient and messageBroker."
      );
    }
    this.supabase = supabaseClient;
    this.messageBroker = messageBroker;
    this.exchangeName = "events_exchange"; // 👈 ชื่อ Exchange มาตรฐานที่เราใช้

    // สร้าง instance ของ SlotProjection
    this.slotProjection = new SlotProjection(this.supabase);

    this.handleEvent = this.handleEvent.bind(this);
  }

  /**
   * เมธอดหลักที่ใช้เริ่มต้นการทำงานของ Consumer
   */
  async start() {
    const channel = this.messageBroker.getChannel();
    if (!channel) {
      throw new Error(
        "[SlotSvc] RabbitMQ channel is not available for Consumer."
      );
    }

    // 1. ตรวจสอบว่า Exchange (แบบ fanout) มีอยู่จริง
    await channel.assertExchange(this.exchangeName, "fanout", {
      durable: true,
    });

    // 2. สร้าง Queue ของตัวเองแบบชั่วคราว (ไม่ต้องตั้งชื่อ)
    // exclusive: true หมายถึง Queue นี้จะถูกลบเมื่อ Consumer ปิดการเชื่อมต่อ
    const q = await channel.assertQueue("", { exclusive: true });
    console.log(`[EventConsumer][SlotSvc] Created exclusive queue: ${q.queue}`);

    // 3. นำ Queue ของตัวเองไปผูก (bind) กับ Exchange เพื่อรอรับข้อความ
    await channel.bindQueue(q.queue, this.exchangeName, ""); // routingKey เป็น '' สำหรับ fanout
    console.log(
      `[EventConsumer][SlotSvc] Queue ${q.queue} bound to exchange ${this.exchangeName}`
    );

    // 4. เริ่มดักฟัง (consume) ข้อความจาก Queue ของตัวเอง
    channel.consume(
      q.queue,
      async (msg) => {
        if (msg !== null) {
          try {
            const eventMessage = JSON.parse(msg.content.toString());
            console.log(
              `[EventConsumer][SlotSvc] Received event: ${eventMessage.event_type} in queue ${q.queue}`
            );

            // ส่งต่อไปให้ handleEvent จัดการ
            await this.handleEvent(eventMessage);

            // 5. ยืนยันว่ารับและประมวลผลข้อความเสร็จแล้ว
            channel.ack(msg);
          } catch (error) {
            console.error(
              "[EventConsumer][SlotSvc] Error processing message:",
              error
            );
            // แจ้ง Broker ว่าประมวลผลไม่สำเร็จ (false, false = ทิ้งข้อความไป ไม่ต้องส่งใหม่)
            channel.nack(msg, false, false);
          }
        }
      },
      { noAck: false }
    ); // 👈 ใช้ noAck: false เพื่อให้ ack/nack ทำงาน
  }

  /**
   * เมธอดสำหรับแยกประเภท Event และส่งต่อไปยัง Projection ที่ถูกต้อง
   */
  async handleEvent(eventMessage) {
    const { event_type, event_data } = eventMessage;

    try {
      switch (event_type) {
        case "SlotCreatedEvent":
          await this.slotProjection.handleSlotCreated(event_data);
          break;
        // (ในอนาคตจะมี case 'SlotStatusUpdatedEvent':)
        // case 'SlotStatusUpdatedEvent':
        //   await this.slotProjection.handleSlotStatusUpdated(event_data);
        //   break;
        default:
          console.warn(`[SlotSvc] No handler for event type: ${event_type}`);
      }
    } catch (error) {
      console.error(
        `[SlotSvc] Error during event handling (${event_type}):`,
        error
      );
      // โยน Error ต่อเพื่อให้ .nack() ทำงาน
      throw error;
    }
  }
}
