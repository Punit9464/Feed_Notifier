import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { env } from '../config/index.js'
import logger from '../utils/logger.js'
import relations from './relations.js';

let dbPromise = null;
let pool = null;

function getDbInstance() {
    if(!dbPromise) {
        dbPromise = (async() => {
            pool = new Pool({
                connectionString: env.dbUrl,
                max: 10,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 10000
            });

            pool.on("error", (err, client) => logger.error({ err }, "Unexpected PGSQL Pool Error: "));

            await pool.query("SELECT 1");
            logger.info("Database Pool Established Successfully.");

            return drizzle({ client: pool, relations: relations });
        })().catch(async error => {
            logger.error({ error }, 'Database initialization failed.');

            await pool?.end();
            pool = null;
            dbPromise = null;

            throw error;
        });
    }
    return dbPromise;
}

async function closeDbConnection() {
    if(pool) {
        await pool.end();

        pool = null;
        db = null;

        logger.info('Database connection pool closed.');
    }
}

export { getDbInstance, closeDbConnection };