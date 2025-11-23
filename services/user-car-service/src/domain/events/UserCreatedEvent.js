// /services/user-service/src/domain/events/UserCreatedEvent.js
export class UserCreatedEvent {
  constructor({ id, name, email }) {
    this.eventType = "UserCreated";
    this.data = { id, name, email };
  }
}
