// /services/user-car-service/src/infrastructure/persistence/SupabaseEventStore.js

export class SupabaseEventStore {
  constructor(supabaseClient) {
    if (!supabaseClient) {
      throw new Error(
        "Supabase client must be provided to SupabaseEventStore."
      );
    }
    this.supabase = supabaseClient;
    this.tableName = "event_store";
  }

  /**
   * Fetches all events for a given aggregate ID.
   * Still useful when no snapshot exists.
   */
  async getEvents(aggregateId) {
    console.log(
      `[EventStore] Fetching ALL events for aggregate ${aggregateId}`
    );
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("*") // Select all columns including version
      .eq("aggregate_id", aggregateId)
      .order("version", { ascending: true });

    if (error) {
      console.error(
        `Error fetching all events for aggregate ${aggregateId}:`,
        error
      );
      throw new Error(`Could not fetch events for aggregate ${aggregateId}.`);
    }
    console.log(
      `[EventStore] Found ${
        data?.length || 0
      } total events for aggregate ${aggregateId}`
    );
    return data || [];
  }

  /**
   * Saves new events by calling the stored procedure for atomicity and version control.
   * @param {string} aggregateId
   * @param {string} aggregateType
   * @param {Array<object>} events - Array of event objects to save.
   * @param {number} expectedVersion - The version the command handler expects the aggregate to be at.
   */
  async saveEvents(aggregateId, aggregateType, events, expectedVersion) {
    if (!events || events.length === 0) {
      console.log(
        `[EventStore] No events to save for aggregate ${aggregateId}.`
      );
      return; // Nothing to save
    }

    // Calculate the new version after these events are saved
    const newVersion = expectedVersion + events.length;

    console.log(
      `[EventStore] Attempting save via RPC for ${aggregateId}. Expected ${expectedVersion}, New ${newVersion}`
    );

    // Prepare event data for the stored procedure
    const eventsToSave = events.map((event, index) => {
      const eventData = { ...event }; // Clone the event object
      const eventType = event.constructor.name;
      return {
        // Data structure expected by the stored function
        aggregate_id: aggregateId,
        aggregate_type: aggregateType,
        event_type: eventType,
        event_data: eventData,
        version: expectedVersion + index + 1, // Calculate the version for this specific event
      };
    });

    // Get the data of the *last* event in the batch to store in latest_versions
    const latestEventData = eventsToSave[eventsToSave.length - 1].event_data;

    try {
      // Call the PostgreSQL stored function via RPC
      const { data, error } = await this.supabase.rpc(
        "save_events_and_update_version",
        {
          p_aggregate_id: aggregateId,
          p_expected_version: expectedVersion,
          p_new_version: newVersion,
          p_events: eventsToSave, // Pass the array of event records
          p_latest_event_data: latestEventData, // Pass the data of the last event
        }
      );

      // Handle errors returned from the stored function
      if (error) {
        // Check specifically for the concurrency error we defined in the function
        if (error.message.includes("CONCURRENCY_ERROR")) {
          console.warn(
            `[EventStore] Concurrency error detected via RPC for ${aggregateId}. Expected ${expectedVersion}.`
          );
          // Create a specific error object for the handler to catch
          const concurrencyError = new Error(
            `Concurrency Error for ${aggregateId}`
          );
          concurrencyError.code = "CONCURRENCY_ERROR"; // Add code for easier checking
          throw concurrencyError;
        }
        // Handle other RPC or function errors
        console.error(
          `Error saving events via RPC for aggregate ${aggregateId}:`,
          error
        );
        throw new Error(
          `Could not save events for aggregate ${aggregateId}. RPC Error: ${error.message}`
        );
      }

      console.log(
        `[EventStore] Events saved successfully via RPC for ${aggregateId}`
      );
    } catch (rpcError) {
      // Catch errors thrown above or unexpected RPC call errors
      if (rpcError.code === "CONCURRENCY_ERROR") {
        throw rpcError; // Re-throw concurrency error for the handler
      }
      // Log and re-throw unexpected errors
      console.error(
        `[EventStore] Unexpected error during saveEvents RPC call for ${aggregateId}:`,
        rpcError
      );
      throw new Error(`Failed to save events for ${aggregateId}.`);
    }
  }

  /**
   * Fetches only events that occurred after a specific version (used with snapshots).
   * @param {string} aggregateId - The ID of the aggregate.
   * @param {number} version - The version of the snapshot (or 0 if no snapshot).
   * @returns {Promise<Array<object>>} An array of event data objects.
   */
  async getEventsAfterVersion(aggregateId, version) {
    console.log(
      `[EventStore] Fetching events for aggregate ${aggregateId} after version ${version}`
    );
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("event_data, version") // Select version too for potential debugging
      .eq("aggregate_id", aggregateId)
      .gt("version", version) // Filter: version > snapshot_version
      .order("version", { ascending: true }); // Ensure correct order for rehydration

    if (error) {
      console.error(
        `Error fetching events after version ${version} for aggregate ${aggregateId}:`,
        error
      );
      throw new Error(
        `Could not fetch events after version ${version} for aggregate ${aggregateId}.`
      );
    }
    console.log(
      `[EventStore] Found ${
        data?.length || 0
      } events after version ${version} for aggregate ${aggregateId}`
    );
    // Return only the event_data part
    return data.map((row) => row.event_data);
  }
}
