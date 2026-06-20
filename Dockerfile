FROM node:22-alpine AS build

WORKDIR /app

RUN corepack enable

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src

RUN yarn build

FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

RUN corepack enable

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production=true

COPY --from=build /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/index.js"]
