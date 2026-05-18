// Cognito auth helpers — used by api.ts and useAuth hook.
// Wraps browser localStorage token storage (Amplify-style manual flow).

import axios from "axios";
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  GlobalSignOutCommand,
} from "@aws-sdk/client-cognito-identity-provider";

const client = new CognitoIdentityProviderClient({
  region: process.env.NEXT_PUBLIC_AWS_REGION ?? "us-east-1",
});

const CLIENT_ID = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!;

const STORAGE_KEYS = {
  idToken:      "syncora_id_token",
  accessToken:  "syncora_access_token",
  refreshToken: "syncora_refresh_token",
};

export async function signIn(email: string, password: string) {
  const res = await client.send(
    new InitiateAuthCommand({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: CLIENT_ID,
      AuthParameters: { USERNAME: email, PASSWORD: password },
    })
  );

  const tokens = res.AuthenticationResult!;
  localStorage.setItem(STORAGE_KEYS.idToken,      tokens.IdToken!);
  localStorage.setItem(STORAGE_KEYS.accessToken,  tokens.AccessToken!);
  localStorage.setItem(STORAGE_KEYS.refreshToken, tokens.RefreshToken!);

  return tokens;
}

export async function signOut() {
  const accessToken = localStorage.getItem(STORAGE_KEYS.accessToken);
  if (accessToken) {
    try {
      await client.send(new GlobalSignOutCommand({ AccessToken: accessToken }));
    } catch {
      // ignore — clear local state regardless
    }
  }
  Object.values(STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
}

export function getIdToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEYS.idToken);
}

export function isLoggedIn(): boolean {
  return !!getIdToken();
}

// Register a new organization + its root admin account via the backend public endpoint.
// This is the ONLY public account-creation endpoint — managers and employees are
// created from inside the app by an authenticated admin/manager.
export async function registerOrganization(
  organizationName: string,
  adminName: string,
  adminEmail: string,
  password: string,
) {
  const base = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api").replace(/\/+$/, "");
  const res = await axios.post(
    `${base}/auth/register-organization`,
    { organizationName, adminName, adminEmail, password },
    { headers: { "Content-Type": "application/json" } },
  );
  return res.data as { message: string; orgId: string; managerUserId?: string; adminUserId?: string };
}

// Read the caller's orgId out of the current ID token (no verification — backend verifies).
export function getOrgId(): string | null {
  const token = getIdToken();
  if (!token) return null;
  const payload = parseTokenPayload(token);
  return (payload["custom:orgId"] as string | undefined) ?? null;
}

// Parse the JWT payload (no verification — backend verifies)
export function parseTokenPayload(token: string): Record<string, unknown> {
  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch {
    return {};
  }
}
