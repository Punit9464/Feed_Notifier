import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
    dbCredentials: {
        url: process.env.DB_URL
    },
    out: './drizzle',
    schema: './src/db/schema',
    dialect: 'postgresql'
});