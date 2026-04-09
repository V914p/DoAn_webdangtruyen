# WebTruyen Backend API

Backend API for a comic/story social platform built with Node.js, Express, and MongoDB.

## Features

- JWT authentication (`register`, `login`, `get me`)
- Post workflow with moderation states (`draft -> pending -> approved/rejected`)
- Public post feed with search, tag filter, sort, pagination
- Comment system on approved posts
- Bookmark system for approved posts
- User follow/unfollow + followers/following lists
- Notification system (follow/comment/system types)
- Role-based access (`user`, `moderator`, `admin`)
- Soft-delete for posts and comments

## Tech Stack

- Node.js (>= 18)
- Express.js
- MongoDB + Mongoose
- JWT (`jsonwebtoken`)
- Security middleware: `helmet`, `cors`, `express-rate-limit`

## Project Structure

```text
src/
  config/         # env + database connection
  controllers/    # business logic
  middlewares/    # auth/error/notFound/post guards
  models/         # mongoose schemas
  routes/         # api endpoints
  utils/          # helpers/services
  app.js          # express app setup
  server.js       # entrypoint
```

## Setup

1. Install dependencies

```bash
npm install
```

2. Create environment file

```bash
cp .env.example .env
```

If you are on Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

3. Update `.env`

```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/webtruyen
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production
JWT_EXPIRES_IN=7d

# SMTP settings (optional) - configure to send real emails
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=giapvu10624@gmail.com
SMTP_PASS=pqfw fjkf stqg ihtd
EMAIL_FROM=giapvu10624@gmail.com
```

4. Run server

```bash
npm run dev
```

or

```bash
npm start
```

Base URL: `http://localhost:5000/api`

## API Endpoints

### Health

- `GET /health`

### Auth

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me` (auth)

### Posts

- `POST /posts` (auth)
- `GET /posts` — public post feed, supports search / filter / sort / pagination (see details below)
- `GET /posts/:id` (public for approved, owner can view own non-approved posts)
- `PUT /posts/:id` (auth + owner)
- `POST /posts/:id/submit` (auth + owner)
- `POST /posts/:id/images` (auth + owner) — upload up to 5 images
- `POST /posts/:id/report` (auth)
- `DELETE /posts/:id` (auth + owner, soft-delete)

#### GET /posts — Query Parameters

Only returns posts with `status = "approved"` and `isDeleted = false`.

| Parameter | Type   | Default  | Description |
|-----------|--------|----------|-------------|
| `search`  | string | —        | Case-insensitive search across `title`, `summary`, and `content` |
| `tag`     | string | —        | Filter by a single tag, e.g. `fantasy` |
| `sort`    | string | `newest` | Sort order — see options below |
| `page`    | number | `1`      | Page number (must be ≥ 1) |
| `limit`   | number | `10`     | Posts per page (1–50) |

**Sort options:**

| Value | Description |
|-------|-------------|
| `newest` | Most recently created posts first |
| `popular` | Ranked by `bookmarksCount` → `commentsCount` → `viewsCount` (all descending) |
| `trending` | Posts published in the **last 7 days**, ranked by the same engagement metrics as `popular` |

**Example requests:**

```
GET /api/posts
GET /api/posts?search=romance
GET /api/posts?tag=fantasy
GET /api/posts?sort=popular
GET /api/posts?sort=trending&limit=5
GET /api/posts?search=art&tag=fantasy&sort=newest&page=2&limit=10
```

**Response:**

```json
{
  "success": true,
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 42,
    "totalPages": 5,
    "hasNextPage": true,
    "hasPrevPage": false
  },
  "posts": [ ... ]
}
```

| Pagination field | Description |
|-----------------|-------------|
| `page` | Current page number |
| `limit` | Number of posts requested per page |
| `total` | Total number of posts matching the query |
| `totalPages` | Total number of pages (`Math.ceil(total / limit)`) |
| `hasNextPage` | `true` if there is a next page |
| `hasPrevPage` | `true` if there is a previous page |

### Users

- `GET /users/:id` — public profile (username, bio, avatar, follower counts, post count; `isFollowing` included when authenticated)
- `GET /users/me/posts` (auth)
- `PATCH /users/me/avatar` (auth) — upload avatar image (multipart/form-data, field: `avatar`, max 2 MB)
- `PATCH /users/me/profile` (auth) — update `displayName` and/or `bio`

### Moderation (moderator/admin only)

- `GET /admin/posts/pending`
- `PATCH /admin/posts/:id/approve`
- `PATCH /admin/posts/:id/reject`
- `GET /admin/reports`
- `PATCH /admin/reports/:id/review`

### Tags

- `GET /tags`

### Comments

- `POST /posts/:id/comments` (auth)
- `GET /posts/:id/comments`
- `DELETE /comments/:id` (auth + comment owner)

### Bookmarks

- `POST /posts/:id/bookmark` (auth)
- `DELETE /posts/:id/bookmark` (auth)
- `GET /users/me/bookmarks` (auth)

### Follow

- `POST /users/:id/follow` (auth)
- `DELETE /users/:id/follow` (auth)
- `GET /users/:id/followers`
- `GET /users/:id/following`

### Notifications

- `GET /notifications` (auth)
- `PATCH /notifications/:id/read` (auth)
- `PATCH /notifications/read-all` (auth)

### Reading History

- `POST /history/:postId` (auth) — record or update reading progress for a post
- `GET /history/me` (auth) — list reading history (most recent first)
- `DELETE /history/:postId` (auth) — remove a single post from history

## Moderation Workflow

- New posts are always created as `draft`
- Owner submits post: `POST /posts/:id/submit` -> `pending`
- Moderator/Admin reviews:
  - `PATCH /admin/posts/:id/approve` -> `approved`
  - `PATCH /admin/posts/:id/reject` -> `rejected`

## Notes

- `register` creates users with default role `user`
- To test moderation endpoints locally, set a user role to `moderator` or `admin` in MongoDB
- Post and comment delete operations are soft-delete

## License

MIT
