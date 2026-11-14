import { defineRelations } from 'drizzle-orm';
import { streamSubsTable } from './schema/streamSubs.js';
import { streamersTable } from './schema/streamer.js';

const relations = defineRelations({ streamersTable, streamSubsTable }, (r) => (
    {
        streamersTable: {
            subscriptions: r.many.streamSubsTable({
                from: r.streamersTable.id,
                to: r.streamSubsTable.streamerId,
            })
        },
        streamSubsTable: {
            streamer: r.one.streamersTable({
                from: r.streamSubsTable.streamerId,
                to: r.streamersTable.id,
            })
        }
    }
));

export default relations;