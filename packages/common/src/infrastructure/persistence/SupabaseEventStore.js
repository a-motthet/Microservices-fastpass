// packages/common/src/infrastructure/persistence/SupabaseEventStore.js
// Shared Supabase Event Store for all microservices

export class SupabaseEventStore {
  constructor(supabaseClient, serviceName = "Unknown") {
    if (!supabaseClient) {
      throw new Error(
        "Supabase client must be provided to SupabaseEventStore."
      );
    }
    this.supabase = supabaseClient;
    this.serviceName = serviceName; // For logging purposes
    this.tableName = "event_store";
  }

  /**
   * Fetches all events for a given aggregate ID.
   */
  async getEvents(aggregateId) {
    console.log(
      `[EventStore][${this.serviceName}] Fetching ALL events for aggregate ${aggregateId}`
    );
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("*")
      .eq("aggregate_id", aggregateId)
      .order("version", { ascending: true });

    if (error) {
      console.error(
        `[EventStore][${this.serviceName}] Error fetching all events for aggregate ${aggregateId}:`,
        error
      );
      throw new Error(`Could not fetch events for aggregate ${aggregateId}.`);
    }
    console.log(
      `[EventStore][${this.serviceName}] Found ${
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
   * @param {number} expectedVersion - The version the command handler expects.
   */
  async saveEvents(aggregateId, aggregateType, events, expectedVersion) {
    if (!events || events.length === 0) {
      console.log(
        `[EventStore][${this.serviceName}] No events to save for aggregate ${aggregateId}.`
      );
      return;
    }

    const newVersion = expectedVersion + events.length;
    console.log(
      `[EventStore][${this.serviceName}] Attempting save via RPC for ${aggregateId}. Expected ${expectedVersion}, New ${newVersion}`
    );

    const eventsToSave = events.map((event, index) => {
      let eventData = { ...event };
      const eventType = event.constructor.name;

      // 🔴 Custom Transformation for 'Reservation' Aggregate
      // 🔴 Custom Transformation for 'Reservation' Aggregate
      if (aggregateType === 'Reservation') {
         // User requested EXACT format:
         // Remove redundant/unwanted fields
         delete eventData.vehicleType; 
         delete eventData.vehicle_type;
         delete eventData.status; 
         delete eventData.carId;
         // delete eventData.floorId;  <-- KEPT
         // delete eventData.parkingSiteId; <-- KEPT
         delete eventData.reservedAt; 
         
         // Ensure vehicleTypeCode is present (it is in the event object)
      }

      return {
        aggregate_id: aggregateId,
        aggregate_type: aggregateType,
        event_type: eventType,
        event_data: eventData,
        version: expectedVersion + index + 1,
      };
    });

    // Get the data of the *last* event in the batch
    const latestEventData = eventsToSave[eventsToSave.length - 1].event_data;

    try {
      // Call the stored function
      const { data, error } = await this.supabase.rpc(
        "save_events_and_update_version",
        {
          p_aggregate_id: aggregateId,
          p_expected_version: expectedVersion,
          p_new_version: newVersion,
          p_events: eventsToSave,
          p_latest_event_data: latestEventData,
        }
      );

      if (error) {
        if (error.message.includes("CONCURRENCY_ERROR")) {
          console.warn(
            `[EventStore][${this.serviceName}] Concurrency error detected via RPC for ${aggregateId}.`
          );
          const concurrencyError = new Error(
            `Concurrency Error for ${aggregateId}`
          );
          concurrencyError.code = "CONCURRENCY_ERROR";
          throw concurrencyError;
        }
        console.error(
          `[EventStore][${this.serviceName}] Error saving events via RPC for aggregate ${aggregateId}:`,
          error
        );
        throw new Error(
          `Could not save events for aggregate ${aggregateId}. RPC Error: ${error.message}`
        );
      }

      console.log(
        `[EventStore][${this.serviceName}] Events saved successfully via RPC for ${aggregateId}`
      );
    } catch (rpcError) {
      if (rpcError.code === "CONCURRENCY_ERROR") {
        throw rpcError;
      }
      console.error(
        `[EventStore][${this.serviceName}] Unexpected error during saveEvents RPC call for ${aggregateId}:`,
        rpcError
      );
      throw new Error(`Failed to save events for ${aggregateId}.`);
    }
  }

  /**
   * Fetches only events that occurred after a specific version (for snapshots).
   * @param {string} aggregateId - The ID of the aggregate.
   * @param {number} version - The version of the snapshot (or 0 if no snapshot).
   * @returns {Promise<Array<object>>} An array of event data objects.
   */
  async getEventsAfterVersion(aggregateId, version) {
    console.log(
      `[EventStore][${this.serviceName}] Fetching events for aggregate ${aggregateId} after version ${version}`
    );
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("event_data, version")
      .eq("aggregate_id", aggregateId)
      .gt("version", version)
      .order("version", { ascending: true });

    if (error) {
      console.error(
        `[EventStore][${this.serviceName}] Error fetching events after version ${version} for aggregate ${aggregateId}:`,
        error
      );
      throw new Error(
        `Could not fetch events after version ${version} for aggregate ${aggregateId}.`
      );
    }
    console.log(
      `[EventStore][${this.serviceName}] Found ${
        data?.length || 0
      } events after version ${version} for aggregate ${aggregateId}`
    );
    return data.map((row) => row.event_data);
  }
}

