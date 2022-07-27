## build runner
FROM node:lts-alpine as build-runner

# Set temp directory
WORKDIR /tmp/app

# Move package.json
COPY package.json .

# Install dependencies
RUN npm install -g pnpm
RUN pnpm install

# Move source files
COPY prisma ./prisma
COPY src ./src
COPY tsconfig.json   .

# Build project
RUN pnpx prisma generate
RUN pnpm run build

## producation runner
FROM node:lts-alpine as prod-runner

# Set work directory
WORKDIR /app

# Copy package.json from build-runner
COPY --from=build-runner /tmp/app/package.json /app/package.json

# Install dependencies
RUN npm install -g pnpm
RUN pnpm install --only=production

# Move build files
COPY --from=build-runner /tmp/app/build /app/build

# Start bot
CMD [ "node", "build/main.js" ]
