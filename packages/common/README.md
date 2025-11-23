# @parking-reservation/common

Shared infrastructure library for parking reservation microservices.

## Installation

This package is part of a monorepo. To use it in a service, add it to the service's `package.json`:

```json
{
  "dependencies": {
    "@parking-reservation/common": "file:../../packages/common"
  }
}
```

Then run `npm install` in the service directory.

## Usage

### RabbitMQAdapter

```javascript
import { RabbitMQAdapter } from "@parking-reservation/common/messaging/RabbitMQAdapter";

const messageBroker = new RabbitMQAdapter("UserService");
await messageBroker.connect();
await messageBroker.publishEvent(event);
```

### SupabaseEventStore

```javascript
import { SupabaseEventStore } from "@parking-reservation/common/persistence/SupabaseEventStore";

const eventStore = new SupabaseEventStore(supabaseClient, "UserService");
const events = await eventStore.getEvents(aggregateId);
await eventStore.saveEvents(aggregateId, aggregateType, events, expectedVersion);
```

## Migration Guide

To migrate existing services to use this shared library:

1. Add the dependency to `package.json`
2. Update imports:
   ```javascript
   // Old
   import { RabbitMQAdapter } from "./infrastructure/messaging/RabbitMQAdapter.js";
   
   // New
   import { RabbitMQAdapter } from "@parking-reservation/common/messaging/RabbitMQAdapter";
   ```
3. Pass service name to constructor:
   ```javascript
   // Old
   const messageBroker = new RabbitMQAdapter();
   
   // New
   const messageBroker = new RabbitMQAdapter("UserService");
   ```

