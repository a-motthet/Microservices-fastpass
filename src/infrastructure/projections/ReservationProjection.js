// src/projections/ReservationProjection.js
// (สมมติว่ามีการ inject Supabase client เข้ามา)
export class ReservationProjection {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
  }

  // ฟังก์ชันที่ถูกเรียกเมื่อมี Event `ParkingStatusUpdatedEvent` เกิดขึ้น
  async handleParkingStatusUpdated(event) {
    const { reservationId, newStatus, updatedAt } = event;

    console.log(
      `Projecting ParkingStatusUpdatedEvent for reservation: ${reservationId}`
    );

    // --- ตัวอย่าง SQL Query ที่จะถูกรันบน Supabase ---
    const { data, error } = await this.supabase
      .from("reservations")
      .update({
        status: newStatus,
        updated_at: updatedAt,
      })
      .eq("id", reservationId);
    // .select(); // อาจจะ select เพื่อ logging

    if (error) {
      console.error("Error updating reservations:", error);
    } else {
      console.log("Successfully updated reservations:", data);
    }
  }

  async handleReservationCreated(event) {
    const {
      reservationId,
      userId,
      slotId,
      status,
      startTime,
      endTime,
      reservedAt,
    } = event;
    console.log(
      `Projecting ReservationCreatedEvent for reservation: ${reservationId}`
    );

    const { error } = await this.supabase.from("reservations").insert({
      id: reservationId,
      user_id: userId,
      slot_id: slotId,
      status: status,
      reserved_at: reservedAt,
      start_time: startTime,
      end_time: endTime,
      version: 1,
    });

    if (error) {
      console.error("Error inserting new reservation into read model:", error);
    } else {
      console.log("Successfully projected new reservation.");
    }
  }
}
