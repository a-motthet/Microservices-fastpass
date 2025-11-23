// /services/user-service/src/projections/EventConsumer.js
import amqp from "amqplib";
import { UserProjection } from "./UserProjection.js";

export class EventConsumer {
  /**
   * แก้ไข constructor ให้รับ messageBroker เข้ามา
   */
  constructor(supabaseClient, messageBroker) {
    if (!supabaseClient || !messageBroker) {
      throw new Error(
        "EventConsumer requires supabaseClient and messageBroker."
      );
    }
    this.supabase = supabaseClient;
    this.messageBroker = messageBroker; // 👈 ใช้ instance ที่ส่งเข้ามา
    this.exchangeName = "events_exchange"; // 👈 ชื่อ Exchange ให้ตรงกับ Publisher

    // สร้าง instance ของ Projections ที่จะใช้
    this.userProjection = new UserProjection(this.supabase);
    // this.reservationProjection = new ReservationProjection(this.supabase); // ถ้ามี

    this.handleEvent = this.handleEvent.bind(this);
  }

  async start() {
    const channel = this.messageBroker.getChannel();
    if (!channel) {
      throw new Error(
        "[UserSvc] RabbitMQ channel is not available for Consumer."
      );
    }

    // 1. ตรวจสอบว่า Exchange มีอยู่จริง (Type: 'fanout')
    await channel.assertExchange(this.exchangeName, "fanout", {
      durable: true,
    });

    // 2. สร้าง Queue ของตัวเองแบบชั่วคราว (ไม่ต้องตั้งชื่อ)
    // exclusive: true หมายถึง Queue นี้จะถูกลบเมื่อ Consumer ปิดการเชื่อมต่อ
    const q = await channel.assertQueue("", { exclusive: true });
    console.log(`[EventConsumer][UserSvc] Created exclusive queue: ${q.queue}`);

    // 3. นำ Queue ของตัวเองไปผูกกับ Exchange เพื่อรอรับข้อความ
    // routingKey เป็น '' เพราะเป็น fanout
    await channel.bindQueue(q.queue, this.exchangeName, "");
    console.log(
      `[EventConsumer][UserSvc] Queue ${q.queue} bound to exchange ${this.exchangeName}`
    );

    // 4. เริ่มดักฟังจาก Queue ของตัวเอง
    channel.consume(
      q.queue,
      async (msg) => {
        if (msg !== null) {
          try {
            const eventMessage = JSON.parse(msg.content.toString());
            console.log(
              `[EventConsumer][UserSvc] Received event: ${eventMessage.event_type} in queue ${q.queue}`
            );

            // ส่งต่อไปให้ handleEvent จัดการ
            await this.handleEvent(eventMessage);

            // ยืนยันว่ารับและประมวลผลข้อความเสร็จแล้ว
            channel.ack(msg); // 👈 เพิ่ม ack
          } catch (error) {
            console.error(
              "[EventConsumer][UserSvc] Error processing message:",
              error
            );
            // แจ้ง Broker ว่าประมวลผลไม่สำเร็จ (อาจจะให้ส่งใหม่ หรือทิ้งไป ขึ้นอยู่กับ parameter ที่ 3)
            channel.nack(msg, false, false);
          }
        }
      },
      { noAck: false }
    ); // 👈 แก้เป็น false
  }

  /**
   * เมธอดสำหรับแยกประเภท Event และส่งต่อไปยัง Projection ที่ถูกต้อง
   */
  async handleEvent(eventMessage) {
    const { event_type, event_data } = eventMessage;
    switch (event_type) {
      case "UserCreatedEvent":
        await this.userProjection.handleUserCreated(event_data);
        break;
      // เพิ่ม case สำหรับ Event อื่นๆ ที่ user-service ต้องสนใจ
      // case 'ReservationCreatedEvent':
      //   await this.reservationProjection.handleReservationCreated(event_data);
      //   break;
      default:
        console.warn(
          `[EventConsumer][UserSvc] No handler for event type: ${event_type}`
        );
    }
  }
}
