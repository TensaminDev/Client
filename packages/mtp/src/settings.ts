import type { BoundSendFn, ProtocolMessage } from "./mtpContext";
import type { MTPSubscriptionFunction } from "mtp";
import { mtp as schemas } from "@tensamin/shared/data";

export type UserBlob = {
  id: string;
  ciphertext: Uint8Array;
  revision: number;
  updatedAt: number;
};

export type ReceiptPolicy = {
  sendReadReceipts: boolean;
  sendReceivedReceipts: boolean;
  revision: number;
};

export type MessageStoragePolicy = {
  historyMode: "retain" | "delete_after_client_delivery";
  retentionMs: number | null;
  revision: number;
};

function expect<Type extends keyof typeof schemas & string>(
  type: Type,
  response: ProtocolMessage,
): ProtocolMessage<Type> {
  if (response.type !== type) {
    throw new Error(`Expected ${type}, received ${response.type}`);
  }
  return response as ProtocolMessage<Type>;
}

function blob(data: ProtocolMessage<"UserBlobGet">["data"]): UserBlob {
  return {
    id: data.BlobId,
    ciphertext: data.Blob,
    revision: data.VersionNumber,
    updatedAt: data.UpdatedAt,
  };
}

function ownedBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(value.byteLength);
  bytes.set(value);
  return bytes;
}

function receipt(
  data: ProtocolMessage<"ReceiptPolicyGet">["data"],
): ReceiptPolicy {
  return {
    sendReadReceipts: data.SendReadReceipts,
    sendReceivedReceipts: data.SendReceivedReceipts,
    revision: data.VersionNumber,
  };
}

function storage(
  data: ProtocolMessage<"MessageStoragePolicyGet">["data"],
): MessageStoragePolicy {
  return {
    historyMode: data.MessageHistoryMode,
    retentionMs: data.MessageRetentionDuration ?? null,
    revision: data.VersionNumber,
  };
}

export function createSettingsClient({
  send,
  subscribe,
}: {
  send: BoundSendFn;
  subscribe: MTPSubscriptionFunction<typeof schemas>;
}) {
  return {
    async createBlob(id: string, ciphertext: Uint8Array) {
      return blob(
        expect(
          "UserBlobPut",
          await send("UserBlobPut", {
            BlobId: id,
            Blob: ownedBytes(ciphertext),
            ExpectedRevision: 0,
          }),
        ).data,
      );
    },
    async updateBlob(
      id: string,
      ciphertext: Uint8Array,
      expectedRevision: number,
    ) {
      return blob(
        expect(
          "UserBlobPut",
          await send("UserBlobPut", {
            BlobId: id,
            Blob: ownedBytes(ciphertext),
            ExpectedRevision: expectedRevision,
          }),
        ).data,
      );
    },
    async getBlob(id: string) {
      return blob(
        expect("UserBlobGet", await send("UserBlobGet", { BlobId: id })).data,
      );
    },
    async listBlobs() {
      return expect(
        "UserBlobList",
        await send("UserBlobList", {}),
      ).data.Blobs.map(blob);
    },
    async deleteBlob(id: string, expectedRevision: number) {
      return (
        expect(
          "UserBlobDelete",
          await send("UserBlobDelete", {
            BlobId: id,
            ExpectedRevision: expectedRevision,
          }),
        ).data.VersionNumber ?? null
      );
    },
    async blockUser(userId: number) {
      const data = expect(
        "UserBlock",
        await send("UserBlock", { BlockedUserId: userId }),
      ).data;
      return { userId: data.BlockedUserId, revision: data.VersionNumber };
    },
    async unblockUser(userId: number) {
      expect(
        "UserUnblock",
        await send("UserUnblock", { BlockedUserId: userId }),
      );
    },
    async getBlockedUsers() {
      return expect("BlockedUsersGet", await send("BlockedUsersGet", {})).data
        .BlockedUserIds;
    },
    async getReceiptPolicy() {
      return receipt(
        expect("ReceiptPolicyGet", await send("ReceiptPolicyGet", {})).data,
      );
    },
    async setReceiptPolicy(policy: Omit<ReceiptPolicy, "revision">) {
      return receipt(
        expect(
          "ReceiptPolicySet",
          await send("ReceiptPolicySet", {
            SendReadReceipts: policy.sendReadReceipts,
            SendReceivedReceipts: policy.sendReceivedReceipts,
          }),
        ).data,
      );
    },
    async getMessageStoragePolicy() {
      return storage(
        expect(
          "MessageStoragePolicyGet",
          await send("MessageStoragePolicyGet", {}),
        ).data,
      );
    },
    async setMessageStoragePolicy(
      policy: Omit<MessageStoragePolicy, "revision">,
    ) {
      return storage(
        expect(
          "MessageStoragePolicySet",
          await send("MessageStoragePolicySet", {
            MessageHistoryMode: policy.historyMode,
            ...(policy.retentionMs === null
              ? {}
              : { MessageRetentionDuration: policy.retentionMs }),
          }),
        ).data,
      );
    },
    async loadSnapshot() {
      const [blobs, blockedUserIds, receiptPolicy, messageStoragePolicy] =
        await Promise.all([
          this.listBlobs(),
          this.getBlockedUsers(),
          this.getReceiptPolicy(),
          this.getMessageStoragePolicy(),
        ]);
      return { blobs, blockedUserIds, receiptPolicy, messageStoragePolicy };
    },
    subscribeBlobChanges(
      handler: (event: {
        id: string;
        revision: number;
        deleted: boolean;
      }) => void,
    ) {
      return subscribe("UserBlobChanged", ({ data }) =>
        handler({
          id: data.BlobId,
          revision: data.VersionNumber,
          deleted: data.Deleted,
        }),
      );
    },
    subscribeBlockedUserChanges(
      handler: (event: {
        userId: number;
        revision: number;
        deleted: boolean;
      }) => void,
    ) {
      return subscribe("BlockedUsersChanged", ({ data }) =>
        handler({
          userId: data.BlockedUserId,
          revision: data.VersionNumber,
          deleted: data.Deleted,
        }),
      );
    },
    subscribeReceiptPolicy(handler: (policy: ReceiptPolicy) => void) {
      return subscribe("ReceiptPolicyChanged", ({ data }) =>
        handler(receipt(data)),
      );
    },
    subscribeMessageStoragePolicy(
      handler: (policy: MessageStoragePolicy) => void,
    ) {
      return subscribe("MessageStoragePolicyChanged", ({ data }) =>
        handler(storage(data)),
      );
    },
  };
}

export type SettingsClient = ReturnType<typeof createSettingsClient>;
