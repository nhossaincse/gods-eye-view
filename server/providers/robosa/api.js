import { readRequestBody } from '../common/request.js';
import {
  expiredSessionCookie,
  sessionCookie,
  sessionHashFromRequest,
} from './auth.js';
import { answerRobosaChat } from './chat.js';
import { createAvatarFileStore } from './avatarFiles.js';
import {
  downloadMetaPersonModel,
  MetaPersonError,
  requestMetaPersonAccessToken,
} from './metaperson.js';
import { createRobosaService, RobosaServiceError } from './service.js';
import { createRobosaStore } from './store.js';

const BODY_LIMIT = 64 * 1024;

function writeJson(response, status, payload, headers = {}) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  for (const [name, value] of Object.entries(headers)) {
    response.setHeader(name, value);
  }
  response.end(JSON.stringify(payload));
}

function writeAvatarModel(response, model, access) {
  response.statusCode = 200;
  response.setHeader('Content-Type', 'model/gltf-binary');
  response.setHeader('Content-Length', String(model.length));
  response.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('ETag', `"${access.avatarModel.sha256}"`);
  response.setHeader(
    'Content-Disposition',
    `inline; filename="${access.handle}-twin.glb"`,
  );
  response.end(model);
}

async function readJson(request) {
  try {
    return JSON.parse((await readRequestBody(request, BODY_LIMIT)) || '{}');
  } catch (error) {
    if (error?.code === 'BODY_TOO_LARGE') {
      throw new RobosaServiceError(
        413,
        'BODY_TOO_LARGE',
        'Request is too large.',
      );
    }
    throw new RobosaServiceError(
      400,
      'INVALID_JSON',
      'Request body is invalid.',
    );
  }
}

function requestPath(request) {
  const pathname = new URL(request.url || '/', 'http://localhost').pathname;
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
}

function sameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

function clientAddress(request) {
  return String(
    request.headers['x-forwarded-for'] ||
      request.socket?.remoteAddress ||
      'local',
  )
    .split(',')[0]
    .trim();
}

function createLimiter() {
  const buckets = new Map();
  return function allow(key, max, windowMs) {
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (bucket.count >= max) return false;
    bucket.count += 1;
    if (buckets.size > 2000) {
      for (const [bucketKey, value] of buckets) {
        if (value.resetAt <= now) buckets.delete(bucketKey);
      }
    }
    return true;
  };
}

export function createRobosaApiHandler({
  store = createRobosaStore(),
  avatarFiles = createAvatarFileStore(),
  fetchImpl,
  apiKey,
  metaPersonClientId = process.env.ROBOSA_METAPERSON_CLIENT_ID,
  metaPersonClientSecret = process.env.ROBOSA_METAPERSON_CLIENT_SECRET,
  metaPersonDownloadHosts = process.env.ROBOSA_METAPERSON_DOWNLOAD_HOSTS,
} = {}) {
  const service = createRobosaService(store);
  const allow = createLimiter();

  async function authenticated(request) {
    return service.sessionByHash(sessionHashFromRequest(request));
  }

  async function requireOwner(request) {
    const session = await authenticated(request);
    if (!session) {
      throw new RobosaServiceError(
        401,
        'AUTH_REQUIRED',
        'Sign in to continue.',
      );
    }
    return session;
  }

  return async function robosaApiHandler(request, response) {
    const path = requestPath(request);
    const method = request.method || 'GET';

    if (!['GET', 'HEAD'].includes(method) && !sameOrigin(request)) {
      writeJson(response, 403, {
        error: { code: 'ORIGIN_REJECTED', message: 'Request origin rejected.' },
      });
      return;
    }

    try {
      if (method === 'POST' && path === '/auth/register') {
        if (!allow(`register:${clientAddress(request)}`, 5, 60 * 60 * 1000)) {
          writeJson(response, 429, {
            error: {
              code: 'RATE_LIMITED',
              message: 'Too many account attempts. Try again later.',
            },
          });
          return;
        }
        const result = await service.register(await readJson(request));
        writeJson(
          response,
          201,
          { user: result.user, profile: result.profile },
          { 'Set-Cookie': sessionCookie(result.token, request) },
        );
        return;
      }

      if (method === 'POST' && path === '/auth/login') {
        if (!allow(`login:${clientAddress(request)}`, 10, 15 * 60 * 1000)) {
          writeJson(response, 429, {
            error: {
              code: 'RATE_LIMITED',
              message: 'Too many sign-in attempts. Try again later.',
            },
          });
          return;
        }
        const result = await service.login(await readJson(request));
        writeJson(
          response,
          200,
          { user: result.user, profile: result.profile },
          { 'Set-Cookie': sessionCookie(result.token, request) },
        );
        return;
      }

      if (method === 'POST' && path === '/auth/logout') {
        await service.logout(sessionHashFromRequest(request));
        writeJson(
          response,
          200,
          { ok: true },
          { 'Set-Cookie': expiredSessionCookie(request) },
        );
        return;
      }

      if (method === 'GET' && path === '/session') {
        const session = await authenticated(request);
        if (!session) {
          writeJson(response, 200, { authenticated: false });
          return;
        }
        writeJson(response, 200, { authenticated: true, ...session });
        return;
      }

      if (method === 'PUT' && path === '/profile') {
        const session = await requireOwner(request);
        const profile = await service.updateProfile(
          session.user.id,
          await readJson(request),
        );
        writeJson(response, 200, { profile });
        return;
      }

      if (method === 'GET' && path === '/bookings') {
        const session = await requireOwner(request);
        writeJson(response, 200, {
          bookings: await service.listBookings(session.user.id),
        });
        return;
      }

      if (method === 'POST' && path === '/avatar/metaperson/token') {
        const session = await requireOwner(request);
        if (!allow(`avatar-token:${session.user.id}`, 10, 60 * 60 * 1000)) {
          throw new RobosaServiceError(
            429,
            'RATE_LIMITED',
            'Too many avatar generation attempts. Try again later.',
          );
        }
        const token = await requestMetaPersonAccessToken({
          clientId: metaPersonClientId,
          clientSecret: metaPersonClientSecret,
          fetchImpl,
        });
        writeJson(response, 200, {
          ...token,
          creatorUrl: 'https://metaperson.avatarsdk.com/iframe.html',
        });
        return;
      }

      if (method === 'POST' && path === '/avatar/metaperson/import') {
        const session = await requireOwner(request);
        const body = await readJson(request);
        const additionalHosts = String(metaPersonDownloadHosts || '')
          .split(',')
          .map((host) => host.trim())
          .filter(Boolean);
        const model = await downloadMetaPersonModel({
          url: body.url,
          fetchImpl,
          additionalHosts,
        });
        const stored = await avatarFiles.write(session.user.id, model);
        const profile = await service.completeAvatar(session.user.id, {
          ...stored,
          avatarCode: body.avatarCode,
        });
        writeJson(response, 201, { profile });
        return;
      }

      const bookingUpdate = path.match(/^\/bookings\/([a-f0-9-]+)$/i);
      if (method === 'PATCH' && bookingUpdate) {
        const session = await requireOwner(request);
        const { status } = await readJson(request);
        const booking = await service.updateBooking(
          session.user.id,
          bookingUpdate[1],
          status,
        );
        writeJson(response, 200, { booking });
        return;
      }

      const publicBooking = path.match(
        /^\/profiles\/([a-z0-9-]{2,40})\/bookings$/i,
      );
      if (method === 'POST' && publicBooking) {
        const rateKey = `booking:${clientAddress(request)}`;
        if (!allow(rateKey, 10, 60 * 60 * 1000)) {
          writeJson(response, 429, {
            error: {
              code: 'RATE_LIMITED',
              message: 'Too many meeting requests. Try again later.',
            },
          });
          return;
        }
        const booking = await service.createBooking(
          publicBooking[1],
          await readJson(request),
        );
        writeJson(response, 201, { booking });
        return;
      }

      const publicChat = path.match(/^\/profiles\/([a-z0-9-]{2,40})\/chat$/i);
      if (method === 'POST' && publicChat) {
        const rateKey = `chat:${clientAddress(request)}`;
        if (!allow(rateKey, 30, 60 * 1000)) {
          writeJson(response, 429, {
            error: {
              code: 'RATE_LIMITED',
              message: 'The twin needs a short pause. Try again soon.',
            },
          });
          return;
        }
        const body = await readJson(request);
        const message = String(body?.message || '')
          .trim()
          .slice(0, 1000);
        if (!message) {
          throw new RobosaServiceError(
            400,
            'MESSAGE_REQUIRED',
            'Enter a message.',
          );
        }
        const session = await authenticated(request);
        const conversation = await service.conversation(
          publicChat[1],
          String(body?.conversationId || ''),
          session?.user.id,
        );
        const answer = await answerRobosaChat({
          profile: conversation.profile,
          message,
          history: conversation.messages,
          apiKey,
          fetchImpl,
        });
        await service.appendTurn(conversation.id, message, answer.text);
        writeJson(response, 200, {
          conversationId: conversation.id,
          ...answer,
        });
        return;
      }

      const publicAvatar = path.match(
        /^\/profiles\/([a-z0-9-]{2,40})\/avatar\.glb$/i,
      );
      if (['GET', 'HEAD'].includes(method) && publicAvatar) {
        const session = await authenticated(request);
        const access = await service.avatarAccess(
          publicAvatar[1],
          session?.user.id,
        );
        if (!access) {
          writeJson(response, 404, {
            error: { code: 'AVATAR_NOT_FOUND', message: 'Avatar not found.' },
          });
          return;
        }
        if (method === 'HEAD') {
          response.statusCode = 200;
          response.setHeader('Content-Type', 'model/gltf-binary');
          response.setHeader('Content-Length', String(access.avatarModel.size));
          response.setHeader('ETag', `"${access.avatarModel.sha256}"`);
          response.end();
          return;
        }
        try {
          writeAvatarModel(
            response,
            await avatarFiles.read(access.ownerId),
            access,
          );
        } catch (error) {
          if (error?.code !== 'ENOENT') throw error;
          writeJson(response, 404, {
            error: { code: 'AVATAR_NOT_FOUND', message: 'Avatar not found.' },
          });
        }
        return;
      }

      const publicProfile = path.match(/^\/profiles\/([a-z0-9-]{2,40})$/i);
      if (method === 'GET' && publicProfile) {
        const session = await authenticated(request);
        const profile = await service.publicProfile(
          publicProfile[1],
          session?.user.id,
        );
        if (!profile) {
          writeJson(response, 404, {
            error: { code: 'PROFILE_NOT_FOUND', message: 'Twin not found.' },
          });
          return;
        }
        writeJson(response, 200, { profile });
        return;
      }

      writeJson(response, 404, {
        error: { code: 'NOT_FOUND', message: 'Endpoint not found.' },
      });
    } catch (error) {
      if (
        error instanceof RobosaServiceError ||
        error instanceof MetaPersonError
      ) {
        writeJson(response, error.status, {
          error: { code: error.code, message: error.message },
        });
        return;
      }
      console.warn('[robosa] request failed');
      writeJson(response, 500, {
        error: { code: 'INTERNAL_ERROR', message: 'Request failed.' },
      });
    }
  };
}

export function robosaApiPlugin(options) {
  const handler = createRobosaApiHandler(options);
  const install = ({ middlewares }) => {
    middlewares.use('/api/robosa', handler);
  };
  return {
    name: 'robosa-api',
    configureServer: install,
    configurePreviewServer: install,
  };
}
