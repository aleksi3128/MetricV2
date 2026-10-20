/**
 * La passkey côté navigateur (`docs/exploitation-securite.md`, D1).
 *
 * Le serveur rend ses options en JSON, où tout ce qui est octets — le défi, l'identifiant
 * de l'utilisateur, ceux des passkeys connues — est en base64url. Le navigateur veut des
 * `ArrayBuffer`, et rend des `ArrayBuffer` : ce module ne fait que traduire, dans les deux
 * sens. **Aucune vérification ici** : c'est le serveur qui juge une signature.
 */

type Json = Record<string, unknown>;

function toBytes(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function toText(buffer: ArrayBuffer | null): string | null {
  if (buffer === null) return null;
  let binary = '';
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

interface Descriptor {
  id: string;
  type: 'public-key';
  transports?: AuthenticatorTransport[];
}

function descriptors(list: unknown): PublicKeyCredentialDescriptor[] {
  return ((list as Descriptor[] | undefined) ?? []).map((item) => ({
    ...item,
    id: toBytes(item.id),
  }));
}

/** Le navigateur sait-il ce qu'est une passkey ? */
export function passkeySupported(): boolean {
  return typeof window !== 'undefined' && 'PublicKeyCredential' in window;
}

/** Créer une passkey depuis les options du serveur ; rend ce que le serveur vérifiera. */
export async function createPasskey(options: Json): Promise<Json> {
  const user = options.user as { id: string; name: string; displayName: string };
  const credential = (await navigator.credentials.create({
    publicKey: {
      ...(options as unknown as PublicKeyCredentialCreationOptions),
      challenge: toBytes(options.challenge as string),
      user: { ...user, id: toBytes(user.id) },
      excludeCredentials: descriptors(options.excludeCredentials),
    },
  })) as PublicKeyCredential | null;
  if (credential === null) throw new Error('Ajout annulé.');
  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    id: credential.id,
    rawId: toText(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: toText(response.clientDataJSON),
      attestationObject: toText(response.attestationObject),
      transports: response.getTransports?.() ?? [],
    },
    clientExtensionResults: credential.getClientExtensionResults(),
  };
}

/** Signer le défi de connexion avec une passkey ; rend ce que le serveur vérifiera. */
export async function signWithPasskey(options: Json): Promise<Json> {
  const credential = (await navigator.credentials.get({
    publicKey: {
      ...(options as unknown as PublicKeyCredentialRequestOptions),
      challenge: toBytes(options.challenge as string),
      allowCredentials: descriptors(options.allowCredentials),
    },
  })) as PublicKeyCredential | null;
  if (credential === null) throw new Error('Connexion annulée.');
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: toText(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: toText(response.clientDataJSON),
      authenticatorData: toText(response.authenticatorData),
      signature: toText(response.signature),
      userHandle: toText(response.userHandle),
    },
    clientExtensionResults: credential.getClientExtensionResults(),
  };
}
