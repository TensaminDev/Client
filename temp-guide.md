# Client Calling Implementation Guide

## Scope

The client should continue using its existing primary `Omikron` connection for call control.

The implementation must stop assuming that:

```text
primary Omikron == permanent call owner == fixed LiveKit server
```

For the current release they are the same call-control Omikron. The client API should still represent call ownership explicitly so a later secondary call-control connection can be added without changing call UI code.

## Call route state

Add call-owner information to the Zustand state.

```ts
export type CallRoute = {
  ownerOmikronId: number;
  livekitUrl: string | null;
};

export type CallState = {
  // existing fields
  callId: string | null;
  callRoute: CallRoute | null;
};
```

For an incoming invitation, retain the owner separately:

```ts
incomingCallInvite: {
  callId: string;
  callSecret: WrappedCallSecret;
  senderId: number;
  ownerOmikronId: number;
} | null;
```

`livekitUrl` is unknown until the call owner returns `CallToken`.

Do not hardcode the LiveKit server.

## Protocol schemas

Update `client/packages/shared/src/data.ts`.

`CallToken` should become:

```ts
CallToken: {
  request: z.object({
    CallId: z.string(),
    CallSecret: callSecretEnvelopeRequest.optional(),
  }),
  response: z.object({
    CallToken: z.string(),
    CallEndpoint: z.string(),
    OmikronId: z.number(),
  }),
},
```

Update `CallInvite.response`:

```ts
CallInvite: {
  request: z.object({
    CallId: z.string(),
    CallSecret: callSecretEnvelopeRequest,
    ReceiverId: z.number(),
  }),
  response: z.object({
    CallId: z.string().optional(),
    CallSecret: callSecretEnvelopeResponse.optional(),
    SenderId: z.number().optional(),
    OmikronId: z.number().optional(),
  }),
},
```

Add schemas for the currently untyped call controls:

```ts
CallDisconnectUser
CallTimeoutUser
CallSetAnonymousJoining
EndCall
```

Keep all call protocol parsing in the shared schema package.

Do not cast MTP responses with:

```ts
response.data as { CallToken: string }
```

Parse them through Zod.

## Call-control transport abstraction

The current call store directly stores:

```ts
send: (...)
```

Replace that dependency with a call-control interface.

For example:

```ts
export type CallControlTransport = {
  request: CallRequestFunction;
};

export type CallRuntime = {
  navigate: ...;
  callControl: CallControlTransport;
  load: ...;
  getPublicKey: ...;
};
```

For now:

```text
CallControlTransport.request
        |
        v
useMTP().send
```

Every call-control request must use this abstraction:

```text
CallToken
CallInvite
CallData
CallDisconnectUser
CallTimeoutUser
CallSetAnonymousJoining
EndCall
```

Do not leave `sendCallInvite()` or moderation commands using the normal MTP sender directly.

This abstraction is what later switches to a secondary connection when `ownerOmikronId` differs from the primary Omikron.

## Call-secret wrapping helper

Move recipient wrapping out of `sendCallInvite()`.

Create one reusable function:

```ts
async function wrapCallSecretForUser(
  userId: number,
  callId: string,
  callSecret: string,
): Promise<ProtocolCallSecret>
```

It should:

1. load the recipient public key,
2. derive the call secret ID,
3. call `wrapCallSecret()`,
4. convert byte fields into protocol byte values,
5. return the protocol envelope.

Use the same helper for:

* the creator's own encrypted envelope,
* every outgoing invitation.

This removes duplicated crypto assembly and makes call creation use the same envelope format as invitation delivery.

## New call creation

The current flow creates the backend call through `CallToken`, connects to LiveKit, then sends a self-invite to store the creator secret.

Remove that sequence.

The new flow is:

```text
generate UUID
      |
generate call secret
      |
wrap call secret for own user
      |
CallToken { CallId, CallSecret }
      |
receive token + endpoint + owner Omikron
      |
connect LiveKit
      |
send recipient invite
```

Inside `joinCall()` for a new call:

1. Ensure the current call state is closed.
2. Generate the UUID.
3. Generate the random E2EE call secret.
4. Configure the LiveKit E2EE key provider.
5. Load the current user ID.
6. Wrap the call secret for that same user.
7. Request `CallToken` with `CallId` and the self envelope.
8. Parse the response.
9. Store `ownerOmikronId`.
10. Store `CallEndpoint`.
11. Open the call route.
12. Connect LiveKit using the returned endpoint.
13. Send the intended user invitation after LiveKit connection succeeds.

Remove:

```ts
ownCallSecretInvitePending
```

Remove the self call:

```ts
sendCallInvite(Number(ownUserId))
```

Remove the one-second `setTimeout()` around the initial recipient invite.

The backend call already exists after successful `CallToken`; no arbitrary delay is required before `CallInvite`.

## Existing call join

For an incoming invitation:

1. Keep the encrypted secret from the event.
2. Keep `OmikronId` from the event.
3. On accept, decrypt the secret.
4. Ensure the call-control transport targets the owner.
5. Request `CallToken` without `CallSecret`.
6. Parse the token response.
7. Verify that the response owner matches the expected owner.
8. Store its `CallEndpoint`.
9. Connect LiveKit to that endpoint.

For the current implementation, step 4 resolves to the existing primary MTP connection.

Do not allow `CallToken` to create the call accidentally when joining. A join request contains no creator `CallSecret`.

## LiveKit connection

Replace:

```ts
getRoom().connect("wss://call.tensamin.net", token, ...)
```

with:

```ts
getRoom().connect(callEndpoint, token, ...)
```

Treat absence of `CallEndpoint` as a protocol error and reset call state.

This is required even before cross-Omikron call control because Omikron already has configurable LiveKit server settings.

## Incoming invitations

Update the subscription:

```ts
subscribe("CallInvite", async ({ data }) => {
  const parsed = mtp.CallInvite.response.parse(data);

  if (
    !parsed.CallId ||
    !parsed.CallSecret ||
    !parsed.SenderId ||
    parsed.OmikronId == null
  ) {
    return;
  }

  // ...
});
```

Store the owner:

```ts
incomingCallInvite: {
  callId: parsed.CallId,
  callSecret: normalizeWrappedCallSecret(parsed.CallSecret),
  senderId: parsed.SenderId,
  ownerOmikronId: parsed.OmikronId,
}
```

Do not infer the owner from the currently connected server.

That inference will become incorrect once invitations can cross Omikrons.

## Accept and decline

The current `respondToInvite()` inserts the call into session state before checking whether the invitation was accepted.

Change the order.

Decline:

```text
stop jingle
clear incoming invite
do not insert call
do not request CallToken
```

Accept:

```text
stop jingle
clear popup
join call
after successful authorization, add/update local call state
```

Do not persist a declined call in `localCalls`.

If declined-call history is wanted later, give it a separate history model. Do not represent it as a current call.

## Call creation failure

Make `joinCall()` transactional from the UI's perspective.

Any failure before the call reaches the connected state must clean:

```text
callId
callRoute
callSecret
livekitToken
invitedUserId
currentCallData
own media state
jingle
```

The current outer catch at `store.tsx:1010-1016` only logs the failure.

Replace that with a common failure cleanup path.

For example:

```ts
try {
  // prepare and connect
} catch (error) {
  await abortCallSetup();
  throw error;
}
```

The caller of `joinCall()` decides whether to display a toast.

Do not leave the store in `"encrypting"` after `CallToken` fails.

## Outgoing invite failure

`sendCallInvite()` should validate the correlated response.

On failure:

1. clear `invitedUserId`,
2. stop the outgoing call jingle if it was waiting for that user,
3. surface the returned protocol error,
4. leave the existing call itself connected.

A failed invitation must not tear down a call that the caller has already joined.

For the current local-only backend, a user who is not locally deliverable on the call owner will fail invitation delivery. Present that as call invitation unavailable, not as successful ringing.

## CallData

Retain `UserIds` for now, but interpret it as accepted call members.

Do not convert every error into:

```ts
exists: false
```

Replace:

```ts
currentCallData: {
  UserIds: number[];
  exists: boolean;
}
```

with a state that distinguishes protocol outcomes:

```ts
type CurrentCallData =
  | { status: "loading" }
  | { status: "ready"; userIds: number[] }
  | { status: "not-found" }
  | { status: "forbidden" }
  | { status: "error"; message: string };
```

Mapping:

```text
CallData                -> ready
ErrorNotFound           -> not-found
ErrorNotAuthenticated   -> forbidden
other error             -> error
```

The preview screen can then distinguish an invalid URL from an authorization problem or backend failure.

## Explicit leave

The Leave button currently only disconnects LiveKit.

On an explicit user leave:

1. retain `callId` and own user ID locally,
2. send `CallDisconnectUser` with the requester's own `UserId`,
3. disconnect LiveKit,
4. clear call state.

Use `try/finally` so local media always disconnects even if the Omikron connection has already failed.

Do not send this command from every LiveKit `Disconnected` event. A transient media disconnection must not revoke authorization automatically.

The distinction is:

```text
user clicks Leave
    -> revoke backend membership

network/LiveKit disconnect
    -> keep backend authorization for reconnect
```

## End call

Expose a separate action for an administrator:

```ts
export async function endCall() {
  // send EndCall
  // disconnect local LiveKit
  // clear local state
}
```

Do not implement End Call by kicking every participant from the client.

Omikron owns termination and deletes the room.

The UI can use backend call state or a future explicit admin field to decide whether to show End Call.

## Timeout and kick controls

When moderation UI is added or connected:

```text
CallTimeoutUser
CallDisconnectUser
```

must await their MTP responses.

Do not optimistically remove users from UI state before the correlated backend response succeeds.

LiveKit participant events will update the active-room UI after the backend removes the participant.

For timeout errors, consume the returned `Timeout` value if present and display the expiry using the same Unix-millisecond convention as `Date.now()`.

## Call session data

`SessionProvider.insertCall()` currently only inserts and never updates an existing call.

Add an upsert operation:

```ts
upsertCall(call)
```

It should replace the existing entry with the same `CallId`.

This is needed because the same call can transition from:

```text
pending invitation
accepted call
updated membership
ended call
```

Also add:

```ts
removeCall(callId)
```

Use it after explicit leave or `EndCall`.

Do not let `localCalls` preserve an ended call after fresh server state no longer contains it.

## Store simplification

After the backend changes, remove these fields and mechanisms:

```text
ownCallSecretInvitePending
self CallInvite
one-second initial invitation timer
hardcoded LiveKit URL
unchecked CallToken response cast
declined-call insertCall
```

The call state should contain only data with a current role in the connection lifecycle.

## Future foreign Omikron handoff

Do not implement this through a second full `MTPProvider`.

The existing Browser and Tauri providers assume that the MTP connection is the application's primary Iota-bound connection. They perform initial state synchronization and react to `ErrorNoIota`.

Create a lightweight call-control connection later.

Its interface should match the `CallControlTransport` introduced now.

Future resolution:

```ts
async function getCallControl(ownerOmikronId: number) {
  if (ownerOmikronId === primaryOmikronId) {
    return primaryCallControl;
  }

  return secondaryCallControlPool.getOrConnect(ownerOmikronId);
}
```

The secondary connection should:

1. resolve the owner Omikron through a trusted Omega route lookup,
2. verify the Omikron host public key,
3. authenticate using the user's existing MTP identity,
4. identify as `call-client`,
5. perform no Iota state synchronization,
6. remain scoped to call-control requests.

Do not move the user's primary messaging connection when joining a foreign call.

The client then has:

```text
Primary transport:
    chats
    Iota state
    contacts
    cross-Omikron invitation event

Call transport:
    CallToken
    CallData
    CallInvite
    moderation
    EndCall

LiveKit transport:
    audio
    video
    screen sharing
```

`CallInvite.OmikronId` determines which call transport owns the call.

`CallToken.CallEndpoint` determines which LiveKit endpoint handles media.

Those are separate routing decisions and should remain separate fields.

## Client tests

Add tests around the state machine rather than only individual helpers.

Required tests:

```text
new call sends creator envelope in CallToken
new call does not self-invite
new call uses CallEndpoint returned by Omikron
incoming invite retains owner Omikron ID
declining invite does not insert a call
accepting invite requests a token without creator secret
failed CallToken resets encrypting state
failed invitation stops outgoing ringing state
CallData ErrorNotFound maps to not-found
CallData ErrorNotAuthenticated maps to forbidden
explicit leave sends self CallDisconnectUser
LiveKit network disconnect does not send self CallDisconnectUser
EndCall clears local state
```

Add schema tests for malformed call route and token responses.

Validate the client with the repository's normal commands, including `bunx fallow` according to `AGENTS.md`.
