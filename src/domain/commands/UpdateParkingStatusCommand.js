// src/domain/commands/UpdateParkingStatusCommand.js

export class UpdateParkingStatusCommand {
  /**
   * @param {string} reservationId - ID ของการจองที่ต้องการอัปเดต
   * @param {string} newStatus - สถานะใหม่ เช่น 'checked_in', 'checked_out'
   */
  constructor(reservationId, newStatus) {
    if (!reservationId || !newStatus) {
      throw new Error("Reservation ID and new status are required.");
    }
    this.reservationId = reservationId;
    this.newStatus = newStatus;
  }
}
