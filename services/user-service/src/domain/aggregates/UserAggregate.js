// /services/user-service/src/domain/aggregates/UserAggregate.js
import { UserCreatedEvent } from "../events/UserCreatedEvent.js";

export class UserAggregate {
  constructor(id) {
    this.id = id;
    this.name = null;
    this.email = null;
    this.status = null;
    this.version = 0; // Start version at 0 for a new aggregate
    this.uncommittedEvents = [];
  }

  // Method called by the command handler to initiate user creation
  createUser(command) {
    // Basic validation
    if (!command.name || !command.email) {
      throw new Error("Name and email are required to create a user.");
    }

    // You could add checks here, e.g., if the user already exists (status !== null)
    if (this.status !== null) {
      throw new Error("User already created.");
    }

    const event = new UserCreatedEvent({
      id: this.id,
      name: command.name,
      email: command.email,
    });
    this._apply(event); // Apply the event internally
    this.uncommittedEvents.push(event); // Add to list of changes to be saved
  }

  // Internal method to apply state changes based on events
  _apply(event) {
    if (event instanceof UserCreatedEvent) {
      // No need to set this.id, it's set in the constructor
      this.name = event.name;
      this.email = event.email;
      this.status = "active";
    }
    // Add other event types here (e.g., UserUpdatedEvent, UserDeactivatedEvent)
    // else if (event instanceof UserUpdatedEvent) { ... }

    // Increment version only when applying a *new* uncommitted event
    // Version increment during rehydration is handled separately
  }

  // --- Methods for Snapshotting ---

  /**
   * Returns the current state of the Aggregate for snapshotting.
   * @returns {object} Plain object representing the aggregate's state.
   */
  getState() {
    return {
      id: this.id,
      name: this.name,
      email: this.email,
      status: this.status,
      // Note: We don't save 'version' *within* the snapshot data itself,
      // as the snapshot record already has its own version field.
    };
  }

  /**
   * Rehydrates (initializes) the Aggregate state from a snapshot record.
   * @param {object} snapshotRecord - The snapshot record loaded from the store
   * (contains snapshot_data and version).
   */
  rehydrateFromSnapshot(snapshotRecord) {
    const snapshotData = snapshotRecord.snapshot_data;
    this.id = snapshotData.id;
    this.name = snapshotData.name;
    this.email = snapshotData.email;
    this.status = snapshotData.status;
    this.version = snapshotRecord.version; // Set version from the snapshot record
  }

  /**
   * Applies events that occurred *after* the snapshot was taken.
   * @param {Array<object>} events - An array of event data objects.
   */
  rehydrateFromEvents(events) {
    events.forEach((eventData) => {
      // Re-create event instances if needed, or directly use eventData if _apply can handle it
      // For simplicity, assuming _apply can handle plain data objects here
      this._apply(eventData);
      // Increment version based on the replayed event stream
      // Important: Ensure _apply doesn't also increment version during rehydration
      this.version++;
    });
  }

  // --- End of Snapshotting Methods ---

  // Method to get events that haven't been saved yet
  getUncommittedEvents() {
    return this.uncommittedEvents;
  }

  // (Optional) Method to clear uncommitted events after saving
  clearUncommittedEvents() {
    this.uncommittedEvents = [];
  }
}
