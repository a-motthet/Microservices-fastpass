// src/projections/EventConsumer.js
import { ActivityProjection } from "./ActivityProjection.js";

export class EventConsumer {
  constructor(supabaseClient, messageBroker) {
    this.activityProjection = new ActivityProjection(supabaseClient);
    this.supabase = supabaseClient;
    this.messageBroker = messageBroker; // รับ messageBroker เข้ามาเพื่อใช้งาน
    // this.reservationProjection = new ReservationProjection(this.supabase);
    // this.userProjection = new UserProjection(this.supabase);
    this.handleEvent = this.handleEvent.bind(this);
  }

  async start() {
    if (!this.messageBroker || !this.messageBroker.getChannel()) {
      throw new Error(
        "[EventConsumer][RecentlySvc] Message broker is not connected or channel is not available."
      );
    }

    const channel = this.messageBroker.getChannel();
    const exchangeName = "events_exchange";

    // 1. ตรวจสอบว่า Exchange มีอยู่จริง (Type: 'fanout')
    await channel.assertExchange(exchangeName, "fanout", {
      durable: true,
    });

    // 2. สร้าง Queue ของตัวเองแบบชั่วคราว (exclusive: true)
    const q = await channel.assertQueue("", { exclusive: true });
    console.log(
      `[EventConsumer][RecentlySvc] Created exclusive queue: ${q.queue}`
    );

    // 3. นำ Queue ของตัวเองไปผูกกับ Exchange เพื่อรอรับข้อความ
    // routingKey เป็น '' เพราะเป็น fanout
    await channel.bindQueue(q.queue, exchangeName, "");
    console.log(
      `[EventConsumer][RecentlySvc] Queue ${q.queue} bound to exchange ${exchangeName}`
    );

    // 4. เริ่มดักฟังจาก Queue ของตัวเอง
    channel.consume(
      q.queue,
      async (msg) => {
        if (msg !== null) {
          try {
            // 1. แปลงข้อความจาก Buffer เป็น String และ Parse เป็น JSON
            const eventMessage = JSON.parse(msg.content.toString());
            console.log(
              `[EventConsumer][RecentlySvc] Received event: ${eventMessage.event_type} in queue ${q.queue}`
            );

            // 2. ส่งต่อไปให้เมธอด handleEvent เพื่อประมวลผล
            await this.handleEvent(eventMessage);

            // 3. ส่งสัญญาณ Acknowledge (ack) กลับไปบอก RabbitMQ ว่าประมวลผลสำเร็จแล้ว
            channel.ack(msg);
          } catch (error) {
            console.error(
              "[EventConsumer][RecentlySvc] Error processing message:",
              error
            );
            // ในกรณีที่เกิด Error เราอาจจะส่ง nack เพื่อให้ข้อความกลับเข้าคิว (ต้องมีกลยุทธ์ retry)
            channel.nack(msg, false, false);
          }
        }
      },
      { noAck: false }
    );

    console.log(
      `[EventConsumer][RecentlySvc] Finished setting up consumer for exchange: ${exchangeName}`
    );
  }

  async handleEvent(eventMessage) {
    const { event_type, event_data } = eventMessage;

    console.log(`[Recently Service] Received event: ${event_type}`);

    // ส่ง Event ไปให้ Projection ที่ถูกต้องจัดการ
    switch (event_type) {
      case "ReservationCreatedEvent":
        await this.activityProjection.handleReservationCreated(event_data);
        break;
      case "ParkingStatusUpdatedEvent":
        await this.activityProjection.handleParkingStatusUpdated(event_data);
        break;
      // เพิ่ม case สำหรับ event อื่นๆ ที่ต้องการติดตาม
    }
  }
}
