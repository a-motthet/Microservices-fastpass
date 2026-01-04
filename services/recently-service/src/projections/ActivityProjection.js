// recently-service/src/projections/ActivityProjection.js
export class ActivityProjection {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
  }

  /**
   * เมื่อมีการสร้างการจองใหม่ ให้ INSERT ข้อมูลใหม่ลงไป
   */
  /**
   * เมื่อมีการสร้างการจองใหม่ ให้ INSERT ข้อมูลใหม่ลงไป
   */
  async handleReservationCreated(event) {
    const { 
      reservationId, userId, slotId, status, 
      startDateLocal, startTimeLocal, timeZoneOffset,
      endDateLocal, endTimeLocal,
      vehicleType
    } = event;

    console.log(
      `[Recently] Projecting ReservationCreatedEvent: ${reservationId}`
    );

    // Construct timestamps
    const startISO = `${startDateLocal}T${startTimeLocal}${timeZoneOffset}`;
    const endISO = `${endDateLocal}T${endTimeLocal}${timeZoneOffset}`;

    await this.supabase.from("recent_activities").insert({ // 👈 Fix table name
      reservation_id: reservationId,
      user_id: userId,
      slot_id: slotId,
      status: status || 'pending',
      start_time: new Date(startISO).toISOString(),
      end_time: new Date(endISO).toISOString(),
      updated_at: new Date(),
      vehicle_type: vehicleType || 'car', 
      vehicle_type_code: event.vehicleTypeCode !== undefined ? event.vehicleTypeCode : 1 // 👈 Add vehicle_type_code
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
      .from("recent_activities") // 👈 Fix table name
      .update({
        status: newStatus,
        updated_at: new Date(),
      })
      .eq("reservation_id", reservationId);
  }
}
