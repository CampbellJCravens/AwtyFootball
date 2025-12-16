# Awty Football

A mobile-first web application for managing entries, built with a modern TypeScript full-stack architecture.

## Tech Stack

### Backend
- **Node.js** + **TypeScript**
- **Express** - Web framework
- **Prisma** - ORM for database management
- **PostgreSQL** - Database
- **Zod** - Schema validation
- **dotenv** - Environment configuration

### Frontend
- **React** + **TypeScript**
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Utility-first CSS framework
- **Fetch API** - HTTP client

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher recommended)
- **npm** or **yarn**
- **PostgreSQL** (v12 or higher) - Required for production
  - For local development: Install PostgreSQL locally or use Docker
  - For production: Use a cloud database (Railway, Render, Supabase, etc.)
  - Make sure PostgreSQL is running and accessible
  - You'll need to create a database (or the migration will create it if configured)

## Project Structure

```
awty-football/
├── backend/          # Express API server
│   ├── src/
│   │   ├── index.ts      # Main server file
│   │   ├── env.ts        # Environment configuration
│   │   ├── prisma.ts     # Prisma client instance
│   │   ├── routes/       # API route handlers
│   │   └── schemas/      # Zod validation schemas
│   ├── prisma/
│   │   └── schema.prisma # Database schema
│   └── package.json
├── frontend/         # React application
│   ├── src/
│   │   ├── App.tsx       # Main app component
│   │   ├── components/   # React components
│   │   └── api/          # API client functions
│   └── package.json
└── README.md
```

## Setup Instructions

### 1. Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   - Create a `.env` file in the `backend/` directory
   - Copy the following template and update with your PostgreSQL credentials:
     ```env
     DATABASE_URL="postgresql://user:password@localhost:5432/awty_football?schema=public"
     PORT=4000
     ```
   - Replace `user`, `password`, `localhost`, `5432`, and `awty_football` with your actual PostgreSQL settings

4. Run database migrations:
   ```bash
   npm run prisma:migrate
   ```
   This will:
   - Create the database if it doesn't exist (if your PostgreSQL user has permissions)
   - Create the `Entry` table with the required schema
   - Generate the Prisma Client

5. Start the development server:
   ```bash
   npm run dev
   ```
   The server will start on `http://localhost:4000` (or the PORT you specified in `.env`)

### 2. Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. (Optional) Configure API URL:
   - Create a `.env` file in the `frontend/` directory if you need to change the backend URL:
     ```env
     VITE_API_URL=http://localhost:4000/api
     ```
   - By default, the frontend will use `http://localhost:4000/api`

4. Start the development server:
   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:5173`

## API Endpoints

The backend exposes the following REST endpoints:

- **POST** `/api/entries` - Create a new entry
  - Body: `{ "title": string, "content": string }`
  - Returns: Created entry object

- **GET** `/api/entries` - Get all entries
  - Returns: Array of entries (ordered by createdAt DESC)

- **GET** `/api/entries/:id` - Get a single entry by ID
  - Returns: Entry object or 404 if not found

- **DELETE** `/api/entries/:id` - Delete an entry by ID
  - Returns: 204 No Content or 404 if not found

- **GET** `/health` - Health check endpoint
  - Returns: `{ "status": "ok" }`

## CORS Configuration

The backend is configured to allow requests from `http://localhost:5173` (Vite's default port). If you change the frontend port or deploy to a different URL, update the CORS configuration in `backend/src/index.ts`:

```typescript
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
```

Or set the `FRONTEND_URL` environment variable in your backend `.env` file.

## Development Workflow

### Backend Development

- **Dev server**: `npm run dev` (uses ts-node-dev for hot reload)
- **Build**: `npm run build` (compiles TypeScript to JavaScript)
- **Start production**: `npm start` (runs compiled code)
- **Database migrations**: `npm run prisma:migrate`
- **Prisma Studio**: `npm run prisma:studio` (GUI to view/edit database)

### Frontend Development

- **Dev server**: `npm run dev` (Vite dev server with HMR)
- **Build**: `npm run build` (production build)
- **Preview**: `npm run preview` (preview production build)

## Database Schema

The app uses PostgreSQL with the following main models:

- **Player**: Stores player information (name, picture, team)
- **Game**: Stores game data (team assignments, goals)
- **User**: Stores authenticated user information
- **AllowedEmail**: Email allowlist for authentication
- **AppSettings**: Global app settings (guest count)

See `backend/prisma/schema.prisma` for the complete schema.

## Troubleshooting

### Database Connection Issues

- Ensure PostgreSQL is running: `pg_isready` or check your PostgreSQL service
- Verify your `DATABASE_URL` in `backend/.env` is correct
- Check that the database exists (or that your user has permission to create it)
- Ensure your PostgreSQL user has the necessary permissions

### CORS Errors

- Make sure the backend is running on the expected port (default: 4000)
- Verify the frontend is making requests to the correct backend URL
- Check the CORS configuration in `backend/src/index.ts`

### Port Already in Use

- Backend: Change `PORT` in `backend/.env`
- Frontend: Modify `vite.config.ts` or use `npm run dev -- --port 3000`

## Authentication

The app uses Google OAuth for authentication. See `OAUTH_SETUP.md` for setup instructions.

## Deployment

For production deployment, see:
- `DEPLOYMENT_GUIDE.md` - General deployment guide
- `PRODUCTION_SETUP.md` - Production setup for awtyfootballclub.com

## Next Steps

- Deploy to production (Railway + Vercel recommended)
- Set up custom domain (awtyfootballclub.com)
- Add more features as needed
- Set up monitoring and error tracking

## License

ISC

