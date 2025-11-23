// /services/user-service/src/application/handlers/command-handlers/CreateUserCommandHandler.js
import { UserAggregate } from "../../../domain/aggregates/UserAggregate.js";
import { randomUUID } from "crypto"; // Assuming UserAggregate needs an ID

export class CreateUserCommandHandler {
  constructor(eventStore, messageBroker) {
    this.eventStore = eventStore;
    this.messageBroker = messageBroker;
  }

  // Changed method name to 'handle' for consistency
  async handle(command) {
    const { name, email } = command;
    const userId = randomUUID(); // Generate ID here

    // Assuming UserAggregate has a method like createUser
    // You might need to adjust this based on your UserAggregate implementation
    const userAggregate = new UserAggregate(userId);
    userAggregate.createUser(command); // Let the aggregate create the event

    const events = userAggregate.getUncommittedEvents();

    if (events.length > 0) {
      // For creating a new aggregate, the expected version is always 0
      const expectedVersion = 0;

      try {
        // 🔽 Wrap saveEvents in try...catch 🔽
        await this.eventStore.saveEvents(
          userAggregate.id,
          "User",
          events,
          expectedVersion // Pass expected version (0 for new aggregate)
        );

        // Publish events only after successful save
        for (const event of events) {
          // Assuming publishEvent is the correct method name now
          await this.messageBroker.publishEvent(event);
        }
        // 🔽 Add catch block 🔽
      } catch (error) {
        // Check for Unique Violation (concurrency error, unlikely for create)
        if (error.code === "23505") {
          console.error(
            "[CRITICAL] Concurrency error during user creation:",
            error
          );
          throw new Error(
            "Concurrency Error: Failed to create user due to potential ID conflict."
          );
        }
        // Re-throw other errors
        throw error;
      }
    }

    return { id: userAggregate.id };
  }
}
