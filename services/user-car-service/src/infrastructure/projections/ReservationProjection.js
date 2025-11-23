// /services/user-car-service/src/projections/ReservationProjection.js

export class ReservationProjection {
  constructor(supabaseClient) {
    if (!supabaseClient) {
      throw new Error("ReservationProjection requires a Supabase client.");
    }
    this.supabase = supabaseClient;
    this.tableName = 'reservations'; // ชื่อตาราง Read Model
  }

  /**
   * จัดการ Event เมื่อมีการสร้างการจองใหม่
   * บันทึกข้อมูลลงตาราง reservations
   */
  async handleReservationCreated(event) {
    const {
      reservationId,
      userId,
      slotId,
      status,
      startTime,
      endTime,
      reservedAt,
      parkingSiteId,
      floorId 
    } = event;

    console.log(
      `[ReservationProjection] Projecting ReservationCreatedEvent for reservation: ${reservationId}`
    );

    const { error } = await this.supabase
      .from(this.tableName)
      .insert({
        id: reservationId,
        user_id: userId,
        parking_site_id: parkingSiteId,
        floor_id: floorId,
        slot_id: slotId,
        status: status || 'pending',
        start_time: startTime,
        end_time: endTime,
        reserved_at: reservedAt,
        version: 1,
        updated_at: new Date()
      });

    if (error) {
      console.error(
        `[ReservationProjection] Error inserting new reservation:`,
        error
      );
      // โยน Error ออกไปเพื่อให้ Consumer รู้ว่าทำไม่สำเร็จ (และอาจ Retry)
      throw error;
    } else {
      console.log(
        `[ReservationProjection] Successfully projected new reservation.`
      );
    }
  }

  /**
   * จัดการ Event เมื่อมีการอัปเดตสถานะ (เช่น check-in, cancel)
   * อัปเดตสถานะในตาราง reservations
   */
  async handleParkingStatusUpdated(event) {
    const { reservationId, newStatus, updatedAt } = event;

    console.log(
      `[ReservationProjection] Projecting ParkingStatusUpdatedEvent for reservation: ${reservationId} -> ${newStatus}`
    );

    const { data, error } = await this.supabase
      .from(this.tableName)
      .update({
        status: newStatus,
        updated_at: updatedAt || new Date(),
      })
      .eq("id", reservationId)
      .select(); // เลือกข้อมูลกลับมาดูเพื่อ confirm

    if (error) {
      console.error(
        `[ReservationProjection] Error updating reservation status:`,
        error
      );
      throw error;
    } else {
      console.log(
        `[ReservationProjection] Successfully updated status for reservation: ${reservationId}`
      );
    }
  }
}