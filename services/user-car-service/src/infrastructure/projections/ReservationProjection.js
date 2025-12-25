// /services/user-car-service/src/projections/ReservationProjection.js

export class ReservationProjection {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
    this.tableName = 'reservations';
  }

  async handleReservationCreated(event) {
    const {
      reservationId, userId, slotId, status, parkingSiteId, floorId,
      startDateLocal, startTimeLocal, timeZoneOffset,
      endDateLocal, endTimeLocal, createdAt
    } = event;

    console.log(`[ReservationProjection] Processing ${reservationId}`);
    
    // Debug: เช็กว่าค่ามาครบไหม
    // Debug: เช็กว่าค่ามาครบไหม
    console.log("[ReservationProjection] Payload:", JSON.stringify(event, null, 2));

    if (!startDateLocal || !startTimeLocal || !timeZoneOffset) {
        console.error("[ReservationProjection] MISSING TIME DATA in Event:", { startDateLocal, startTimeLocal, timeZoneOffset });
        // return; // Comment out temporarily to see if we can proceed or force error
    }

    try {
      // แปลงกลับเป็น UTC ISO String สำหรับ Database
      const startTimeUTC = new Date(`${startDateLocal}T${startTimeLocal}${timeZoneOffset}`).toISOString();
      const endTimeUTC = new Date(`${endDateLocal}T${endTimeLocal}${timeZoneOffset}`).toISOString();
      
      // createdAt อาจจะเป็น timestamp (number) หรือ string
      let reservedAtUTC;
      if (typeof createdAt === 'number') {
          reservedAtUTC = new Date(createdAt * 1000).toISOString();
      } else {
          reservedAtUTC = new Date().toISOString();
      }

      const { error } = await this.supabase
        .from(this.tableName)
        .insert({
          id: reservationId,
          user_id: userId,
          parking_site_id: parkingSiteId,
          floor_id: floorId,
          slot_id: slotId,
          status: status || 'pending',
          status_code: event.statusCode || '1',
          start_time: startTimeUTC,
          end_time: endTimeUTC,
          reserved_at: reservedAtUTC,
          version: 1,
          updated_at: new Date(),
          vehicle_type: event.vehicleType || 'car', // 👈 New Column
          car_id: event.carId || null               // 👈 New Column
        });

      if (error) throw error;
      console.log(`[ReservationProjection] Successfully projected.`);

    } catch (err) {
      console.error(`[ReservationProjection] Error:`, err);
    }
  }
  /**
   * จัดการ Event เมื่อมีการอัปเดตสถานะ (เช่น check-in, cancel)
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
        status_code: event.statusCode,
        updated_at: updatedAt || new Date(),
      })
      .eq("id", reservationId)
      .select();

    if (error) {
      console.error(`[ReservationProjection] Error updating reservation status:`, error);
      throw error;
    } else {
      console.log(`[ReservationProjection] Successfully updated status for reservation: ${reservationId}`);
    }
  }
}