# FinPilot S3 Storage Setup Guide

This guide explains how FinPilot’s production file storage works and how to fill the S3-related environment variables correctly.

It is specifically for the current backend storage layer in:

- [apps/api/app/services/storage.py](</d:/Documents/My Projects/FinPilot/apps/api/app/services/storage.py>)

## What this storage is used for

Right now, S3-compatible storage is used for:

- profile images

Later it can also be used for:

- imported files
- exported reports
- other user-uploaded media

## Important behavior of the current backend

The backend currently stores:

- `profile_image_storage_key`
- `profile_image_url`

And it returns the `profile_image_url` directly to the mobile app.

That means:

- the stored object must be reachable through a **public URL**
- or through a public CDN/custom domain you provide in `S3_PUBLIC_BASE_URL`

The backend is **not** generating signed temporary URLs right now.

So if your bucket is private and you do not provide a public delivery URL, the upload may succeed but the image will not display in the app.

## When to use S3

Use:

```env
STORAGE_BACKEND=s3
```

when you are deploying the backend for real hosted use.

Do **not** rely on local filesystem in production if you want uploads to survive deploys and instance replacement.

## S3 environment variables

These are the variables FinPilot uses:

```env
STORAGE_BACKEND=s3
S3_BUCKET_NAME=
S3_REGION=
S3_ENDPOINT_URL=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_PUBLIC_BASE_URL=
S3_FORCE_PATH_STYLE=false
```

## What each variable means

### `STORAGE_BACKEND`

Use:

```env
STORAGE_BACKEND=s3
```

This tells the backend to use the S3-compatible storage backend instead of local files.

### `S3_BUCKET_NAME`

Example:

```env
S3_BUCKET_NAME=finpilot-prod-images
```

This is the bucket/container name where FinPilot will write files.

### `S3_REGION`

Example:

```env
S3_REGION=ap-southeast-1
```

For AWS S3, use the actual AWS region.

For some S3-compatible providers, this may be:

- a real region
- `auto`
- or something provider-specific

### `S3_ENDPOINT_URL`

This is the S3 API endpoint.

Examples:

- AWS S3:
  - leave it empty
- Cloudflare R2:
  - `https://<account-id>.r2.cloudflarestorage.com`
- MinIO:
  - `https://minio.yourdomain.com`

So:

```env
S3_ENDPOINT_URL=
```

is correct for normal AWS S3.

### `S3_ACCESS_KEY_ID`

Example:

```env
S3_ACCESS_KEY_ID=AKIA...
```

This is the access key from your object storage provider.

### `S3_SECRET_ACCESS_KEY`

Example:

```env
S3_SECRET_ACCESS_KEY=your-secret-key
```

This is the secret key paired with the access key.

### `S3_PUBLIC_BASE_URL`

This is the most important variable for image display.

Example for AWS S3:

```env
S3_PUBLIC_BASE_URL=https://finpilot-prod-images.s3.ap-southeast-1.amazonaws.com
```

Example for a CDN/custom public domain:

```env
S3_PUBLIC_BASE_URL=https://cdn.example.com
```

The backend will return profile image URLs in this form:

```text
<S3_PUBLIC_BASE_URL>/profile-images/<generated-file-name>
```

So `S3_PUBLIC_BASE_URL` must be the public base that can actually serve the objects.

### `S3_FORCE_PATH_STYLE`

Use:

```env
S3_FORCE_PATH_STYLE=false
```

for normal AWS S3.

Use:

```env
S3_FORCE_PATH_STYLE=true
```

for providers that expect path-style addressing more reliably, such as some:

- MinIO setups
- R2-style setups
- custom S3-compatible endpoints

If uploads fail or object paths look wrong on a non-AWS provider, this is one of the first things to test.

## Recommended AWS S3 example

If you use normal AWS S3, use something like:

```env
STORAGE_BACKEND=s3
S3_BUCKET_NAME=finpilot-prod-images
S3_REGION=ap-southeast-1
S3_ENDPOINT_URL=
S3_ACCESS_KEY_ID=AKIA...
S3_SECRET_ACCESS_KEY=your-secret
S3_PUBLIC_BASE_URL=https://finpilot-prod-images.s3.ap-southeast-1.amazonaws.com
S3_FORCE_PATH_STYLE=false
```

## Recommended S3-compatible example

If you use a non-AWS S3-compatible provider, use something like:

```env
STORAGE_BACKEND=s3
S3_BUCKET_NAME=finpilot-images
S3_REGION=auto
S3_ENDPOINT_URL=https://your-provider-endpoint
S3_ACCESS_KEY_ID=your-access-key
S3_SECRET_ACCESS_KEY=your-secret-key
S3_PUBLIC_BASE_URL=https://your-public-file-domain
S3_FORCE_PATH_STYLE=true
```

Adjust those values according to the provider’s documentation.

## What to configure on the bucket/provider side

For FinPilot’s current implementation, make sure:

1. the bucket exists
2. the access key can:
   - upload objects
   - delete objects
3. the files are publicly readable through the URL you use in `S3_PUBLIC_BASE_URL`

If objects are private and there is no public serving layer, profile images will not render in the app.

## Railway env example

If you are deploying the backend on Railway, the variables would look like this:

```env
STORAGE_BACKEND=s3
S3_BUCKET_NAME=finpilot-prod-images
S3_REGION=ap-southeast-1
S3_ENDPOINT_URL=
S3_ACCESS_KEY_ID=AKIA...
S3_SECRET_ACCESS_KEY=your-secret
S3_PUBLIC_BASE_URL=https://finpilot-prod-images.s3.ap-southeast-1.amazonaws.com
S3_FORCE_PATH_STYLE=false
```

Put them in the **backend Railway service**, not the mobile app.

## What not to put in mobile env

These values belong in the backend only:

- `S3_BUCKET_NAME`
- `S3_REGION`
- `S3_ENDPOINT_URL`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_FORCE_PATH_STYLE`

Do **not** put storage secrets in Expo/mobile env.

## How to test the setup

After setting the variables and deploying the backend:

1. log into the app
2. upload a profile image
3. confirm the response contains a public URL
4. open the profile screen again
5. confirm the image renders
6. replace the image
7. delete the image

If all 3 work:

- upload
- replace
- delete

then the storage configuration is basically correct.

## Common failure cases

### Upload works but image does not display

Most likely:

- `S3_PUBLIC_BASE_URL` is wrong
- object is not publicly readable
- wrong bucket/public domain pairing

### Upload fails immediately

Most likely:

- `S3_ENDPOINT_URL` is wrong
- bad access key / secret
- bucket name is wrong
- path-style vs virtual-host style mismatch

### Delete fails or old image remains

Most likely:

- wrong `profile_image_storage_key`
- wrong bucket
- credentials can upload but not delete

## How FinPilot stores object keys

Right now, profile images are stored under keys like:

```text
profile-images/<user-id>-<random>.png
```

So your public URL should ultimately serve paths like:

```text
https://your-public-base/profile-images/<file-name>
```

## Best practical advice

For the simplest first production setup:

1. use Railway for backend + Postgres
2. use AWS S3 or another S3-compatible provider for storage
3. make sure `S3_PUBLIC_BASE_URL` is actually public
4. test profile image upload before building the APK

