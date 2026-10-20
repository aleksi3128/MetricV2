/**
 * Le pont WebAuthn (`docs/exploitation-securite.md`, D1) : des octets en base64url dans
 * les deux sens, sans perte. Le navigateur est simulé ; la signature, elle, se vérifie au
 * serveur (`backend/tests/test_passkey.py`).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { signWithPasskey } from './passkey';

afterEach(() => {
  vi.unstubAllGlobals();
});

function bytes(...values: number[]): ArrayBuffer {
  return new Uint8Array(values).buffer;
}

describe('le pont WebAuthn', () => {
  it('décode le défi et les clés permises, encode la réponse en base64url', async () => {
    let asked: PublicKeyCredentialRequestOptions | undefined;
    vi.stubGlobal('navigator', {
      credentials: {
        get: (request: CredentialRequestOptions) => {
          asked = request.publicKey;
          return Promise.resolve({
            id: '-_8',
            rawId: bytes(0xfb, 0xff),
            type: 'public-key',
            response: {
              clientDataJSON: bytes(1, 2, 3),
              authenticatorData: bytes(0xff, 0xfe),
              signature: bytes(9),
              userHandle: null,
            },
            getClientExtensionResults: () => ({}),
          });
        },
      },
    });

    const result = await signWithPasskey({
      challenge: '-_8',
      rpId: 'metric.exemple.fr',
      allowCredentials: [{ id: 'AQID', type: 'public-key' }],
    });

    expect(new Uint8Array(asked?.challenge as ArrayBuffer)).toEqual(new Uint8Array([0xfb, 0xff]));
    const allowed = asked?.allowCredentials?.[0]?.id as ArrayBuffer;
    expect(new Uint8Array(allowed)).toEqual(new Uint8Array([1, 2, 3]));
    expect(result).toMatchObject({
      rawId: '-_8',
      response: {
        clientDataJSON: 'AQID',
        authenticatorData: '__4',
        signature: 'CQ',
        userHandle: null,
      },
    });
  });
});
