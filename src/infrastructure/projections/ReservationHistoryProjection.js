// /services/user-car-service/src/projections/ReservationHistoryProjection.js

export class ReservationHistoryProjection {
  constructor(supabaseClient) {
    if (!supabaseClient) {
      throw new Error(
        "ReservationHistoryProjection requires a Supabase client."
      );
    }
    this.supabase = supabaseClient;
    this.tableName = "reservations_history";
  }

  /**
   * จัดการ Event ที่เกี่ยวกับ Reservation (ทั้งสร้างและอัปเดต)
   * @param {object} eventMessage - ข้อความ Event ที่ได้รับจาก Consumer
   */
  async handleReservationEvent(eventMessage) {
    const { event_type, event_data } = eventMessage;

    // เราต้องหา aggregate_id, aggregate_type, และ version จาก Event ที่ส่งมา
    // ซึ่ง EventStore ของเราส่งมาในรูปแบบ event_data

    const aggregateId = event_data.reservationId; // หรือ event_data.id ขึ้นอยู่กับ Event
    const version = event_data.version; // เราต้องมั่นใจว่า Event มี version

    // หมายเหตุ: การหา 'version' ที่ถูกต้องจาก event_data อาจจะซับซ้อน
    // เราอาจจะต้องไปแก้ CommandHandler ให้ส่งข้อมูลดิบของ Event ที่ถูกบันทึกมาแทน

    // *** วิธีที่ง่ายกว่า: ดึงข้อมูลดิบจาก EventStore มาเลย ***
    // (วิธีนี้จะช้า แต่ข้อมูลถูกต้อง 100%)

    try {
      // 1. ดึง Event ล่าสุดที่เพิ่งถูกบันทึกจาก event_store
      // (นี่คือเหตุผลว่าทำไมการคัดลอกถึงซ้ำซ้อน)
      const { data: latestEvent, error: fetchError } = await this.supabase
        .from("event_store")
        .select("*")
        .eq("aggregate_id", event_data.reservationId)
        .order("version", { ascending: false })
        .limit(1)
        .single();

      if (fetchError) throw fetchError;

      // 2. คัดลอกข้อมูลนั้นไปใส่ในตารางใหม่
      const { error: insertError } = await this.supabase
        .from(this.tableName)
        .insert({
          aggregate_id: latestEvent.aggregate_id,
          aggregate_type: latestEvent.aggregate_type,
          event_type: latestEvent.event_type,
          event_data: latestEvent.event_data,
          version: latestEvent.version,
          created_at: latestEvent.created_at,
        });

      if (insertError) throw insertError;

      console.log(
        `[HistoryProjection] Copied event ${latestEvent.event_type} (v${latestEvent.version}) to reservations_history.`
      );
    } catch (error) {
      console.error(
        `[HistoryProjection] Error copying event to history:`,
        error
      );
    }
  }
}
