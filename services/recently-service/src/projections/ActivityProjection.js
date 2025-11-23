// recently-service/src/projections/ActivityProjection.js
export class ActivityProjection {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
  }

  /**
   * เมื่อมีการสร้างการจองใหม่ ให้ INSERT ข้อมูลใหม่ลงไป
   */
  async handleReservationCreated(event) {
    const { reservationId, userId, slotId, status, startTime, endTime } = event;
    console.log(
      `[Recently] Projecting ReservationCreatedEvent: ${reservationId}`
    );

    await this.supabase.from("recently_activity_read_model").insert({
      reservation_id: reservationId,
      user_id: userId,
      slot_id: slotId,
      status: status,
      start_time: startTime,
      end_time: endTime,
      updated_at: new Date(),
    });
  }

  /**
   * เมื่อมีการอัปเดตสถานะ ให้ UPDATE แถวที่มีอยู่
   */
  async handleParkingStatusUpdated(event) {
    const { reservationId, newStatus } = event;
    console.log(
      `[Recently] Projecting ParkingStatusUpdatedEvent: ${reservationId} -> ${newStatus}`
    );

    await this.supabase
      .from("recently_activity_read_model")
      .update({
        status: newStatus,
        updated_at: new Date(),
      })
      .eq("reservation_id", reservationId); // 👈 หาแถวที่จะอัปเดตจาก reservation_id
  }
}
