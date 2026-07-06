# Call PQ Secret Envelope Migration

## What Changed

The backend no longer treats `CallSecret` as a plain ECDH/base64 string. It now parses, stores, forwards, and returns a typed call secret envelope containing `SecretId`, `VersionNumber`, `EncryptedSecret`, `KemCiphertext`, and `WrappingScheme`.

Call secret storage is now recipient-specific. `CallGroup.secrets` is keyed by recipient user ID and stores a `CallSecretEnvelope`, so reconnect/session payloads return only the envelope intended for the current user.

Both authenticated and anonymous `call_invite` handlers now reject a plain-string `CallSecret` with `BadRequest`. The forwarded `CallInvite` push includes the envelope object, and anonymous invite forwarding now includes `CallSecret` as well.

## Why

The call client is migrating from an old ECDH shared-secret protocol to a recipient-specific PQ KEM wrapping protocol. The backend must not decrypt, decapsulate, derive keys, or inspect the encrypted secret material. It only validates that the envelope shape is present and forwards/stores the opaque bytes unchanged.

The previous pairwise string storage mirrored one string for both `(inviter, invitee)` and `(invitee, inviter)`, which is incompatible with recipient-specific KEM ciphertexts. Each recipient needs their own `EncryptedSecret` and `KemCiphertext` envelope.

## Raw Diff

```diff
diff --git a/src/anonymous_clients/anonymous_client_connection.rs b/src/anonymous_clients/anonymous_client_connection.rs
index b2c90e7..ddf69b8 100644
--- a/src/anonymous_clients/anonymous_client_connection.rs
+++ b/src/anonymous_clients/anonymous_client_connection.rs
@@ -7,7 +7,7 @@ use tokio::sync::RwLock;
 use uuid::Uuid;
 
 use crate::anonymous_clients::anonymous_manager::{self, generate_username};
-use crate::calls::call_manager;
+use crate::calls::{call_group::CallSecretEnvelope, call_manager};
 use crate::data::user::UserStatus;
 use crate::omega::omega_connection::{OmegaConnection, get_omega_connection};
 use crate::rho::connection::GeneralConnection;
@@ -367,12 +367,21 @@ impl AnonymousClientConnection {
             }
         };
 
-        let secret = cv
-            .get_data(DataType::CallSecret)
-            .as_str()
-            .map(|s| s.to_string());
-        let invited =
-            call_manager::add_invite(call_id, self.user_id, receiver_id as u64, secret).await;
+        let secret = match CallSecretEnvelope::from_data_value(cv.get_data(DataType::CallSecret)) {
+            Some(secret) => secret,
+            None => {
+                self.send_error_response(&cv.get_id(), CommunicationType::BadRequest)
+                    .await;
+                return;
+            }
+        };
+        let invited = call_manager::add_invite(
+            call_id,
+            self.user_id,
+            receiver_id as u64,
+            Some(secret.clone()),
+        )
+        .await;
         if !invited {
             self.send_error_response(&cv.get_id(), CommunicationType::ErrorInvalidCallId)
                 .await;
@@ -423,6 +432,7 @@ impl AnonymousClientConnection {
         let forward = CommunicationValue::new(CommunicationType::CallInvite)
             .with_receiver(receiver_id as u64)
             .with_sender(sender_id)
+            .add_typed_default(DataType::CallSecret, secret.to_data_value())
             .add_typed_default(DataType::CallId, DataValue::Str(call_id.to_string()))
             .add_typed_default(
                 DataType::ReceiverId,
diff --git a/src/calls/call_group.rs b/src/calls/call_group.rs
index d751802..a5c76ea 100755
--- a/src/calls/call_group.rs
+++ b/src/calls/call_group.rs
@@ -1,4 +1,4 @@
-use mtp::codec::{CommunicationType, CommunicationValue, DataType, DataValue};
+use mtp::codec::{CommunicationType, CommunicationValue, DataType, DataTypeId, DataValue, TypeMap};
 use serde_json::Map;
 
 use std::{collections::BTreeMap, env, sync::Arc, time::Duration};
@@ -16,7 +16,80 @@ pub struct CallGroup {
     pub show: RwLock<bool>,
     pub anonymous_joining: RwLock<bool>,
     pub short_link: RwLock<Option<String>>,
-    pub secrets: RwLock<BTreeMap<(u64, u64), String>>,
+    pub secrets: RwLock<BTreeMap<u64, CallSecretEnvelope>>,
+}
+
+#[derive(Clone, Debug)]
+pub struct CallSecretEnvelope {
+    pub secret_id: String,
+    pub version_number: i64,
+    pub encrypted_secret: Vec<u8>,
+    pub kem_ciphertext: Vec<u8>,
+    pub wrapping_scheme: String,
+}
+
+impl CallSecretEnvelope {
+    pub fn from_data_value(value: &DataValue) -> Option<Self> {
+        let tm = TypeMap::latest();
+        let secret_id = value
+            .get_field(DataType::SecretId.to_id(&tm))?
+            .as_str()?
+            .to_string();
+        let version_number = value
+            .get_field(DataType::VersionNumber.to_id(&tm))?
+            .as_signed_number()
+            .and_then(|n| i64::try_from(n).ok())
+            .or_else(|| {
+                value
+                    .get_field(DataType::VersionNumber.to_id(&tm))?
+                    .as_number()
+                    .and_then(|n| i64::try_from(n).ok())
+            })?;
+        let encrypted_secret = value
+            .get_field(DataType::EncryptedSecret.to_id(&tm))?
+            .as_bytes()?;
+        let kem_ciphertext = value
+            .get_field(DataType::KemCiphertext.to_id(&tm))?
+            .as_bytes()?;
+        let wrapping_scheme = value
+            .get_field(DataType::WrappingScheme.to_id(&tm))?
+            .as_str()?
+            .to_string();
+
+        Some(Self {
+            secret_id,
+            version_number,
+            encrypted_secret,
+            kem_ciphertext,
+            wrapping_scheme,
+        })
+    }
+
+    pub fn to_data_value(&self) -> DataValue {
+        let tm = TypeMap::latest();
+        let mut map: BTreeMap<DataTypeId, DataValue> = BTreeMap::new();
+        map.insert(
+            DataType::SecretId.to_id(&tm),
+            DataValue::Str(self.secret_id.clone()),
+        );
+        map.insert(
+            DataType::VersionNumber.to_id(&tm),
+            DataValue::SignedNumber(self.version_number.into()),
+        );
+        map.insert(
+            DataType::EncryptedSecret.to_id(&tm),
+            DataValue::Bytes(self.encrypted_secret.clone()),
+        );
+        map.insert(
+            DataType::KemCiphertext.to_id(&tm),
+            DataValue::Bytes(self.kem_ciphertext.clone()),
+        );
+        map.insert(
+            DataType::WrappingScheme.to_id(&tm),
+            DataValue::Str(self.wrapping_scheme.clone()),
+        );
+        DataValue::container_from_map(&map)
+    }
 }
 
 impl CallGroup {
diff --git a/src/calls/call_manager.rs b/src/calls/call_manager.rs
index 6c33fd6..718f5f1 100644
--- a/src/calls/call_manager.rs
+++ b/src/calls/call_manager.rs
@@ -3,7 +3,11 @@ use once_cell::sync::Lazy;
 use std::sync::Arc;
 use uuid::Uuid;
 
-use crate::calls::{call_group::CallGroup, call_util, caller::Caller};
+use crate::calls::{
+    call_group::{CallGroup, CallSecretEnvelope},
+    call_util,
+    caller::Caller,
+};
 
 pub static CALL_GROUPS: Lazy<DashMap<Uuid, Arc<CallGroup>>> = Lazy::new(|| DashMap::new());
 #[allow(dead_code)]
@@ -74,7 +78,7 @@ pub async fn add_invite(
     call_id: Uuid,
     inviter_id: u64,
     invitee_id: u64,
-    secret: Option<String>,
+    secret: Option<CallSecretEnvelope>,
 ) -> bool {
     if let Some(cg) = CALL_GROUPS.get(&call_id) {
         let mut members = cg.members.write().await;
@@ -88,8 +92,7 @@ pub async fn add_invite(
 
             if let Some(secret) = secret {
                 let mut secrets = cg.secrets.write().await;
-                secrets.insert((inviter_id, invitee_id), secret.clone());
-                secrets.insert((invitee_id, inviter_id), secret);
+                secrets.insert(invitee_id, secret);
             }
 
             return true;
diff --git a/src/rho/client_connection.rs b/src/rho/client_connection.rs
index 2f0ca96..56a6cba 100644
--- a/src/rho/client_connection.rs
+++ b/src/rho/client_connection.rs
@@ -1,5 +1,5 @@
 use crate::anonymous_clients::anonymous_manager;
-use crate::calls::{call_manager, call_util};
+use crate::calls::{call_group::CallSecretEnvelope, call_manager, call_util};
 use crate::omega::omega_connection::get_omega_connection;
 use crate::rho::connection::GeneralConnection;
 use crate::rho::{rho_connection::RhoConnection, rho_manager};
@@ -354,12 +354,21 @@ impl ClientConnection {
             }
         };
 
-        let secret = cv
-            .get_data(DataType::CallSecret)
-            .as_str()
-            .map(|s| s.to_string());
-        let invited =
-            call_manager::add_invite(call_id, self.user_id, receiver_id as u64, secret).await;
+        let secret = match CallSecretEnvelope::from_data_value(cv.get_data(DataType::CallSecret)) {
+            Some(secret) => secret,
+            None => {
+                self.send_error_response(cv.get_id(), CommunicationType::BadRequest)
+                    .await;
+                return;
+            }
+        };
+        let invited = call_manager::add_invite(
+            call_id,
+            self.user_id,
+            receiver_id as u64,
+            Some(secret.clone()),
+        )
+        .await;
         if !invited {
             self.send_error_response(cv.get_id(), CommunicationType::ErrorInvalidCallId)
                 .await;
@@ -410,10 +419,7 @@ impl ClientConnection {
         let forward = CommunicationValue::new(CommunicationType::CallInvite)
             .with_receiver(receiver_id as u64)
             .with_sender(sender_id as u64)
-            .add_typed_default(
-                DataType::CallSecret,
-                cv.get_data(DataType::CallSecret).clone(),
-            )
+            .add_typed_default(DataType::CallSecret, secret.to_data_value())
             .add_typed_default(DataType::CallId, DataValue::Str(call_id.to_string()))
             .add_typed_default(
                 DataType::ReceiverId,
diff --git a/src/rho/connection.rs b/src/rho/connection.rs
index 90abac0..2e97711 100755
--- a/src/rho/connection.rs
+++ b/src/rho/connection.rs
@@ -207,7 +207,16 @@ impl GeneralConnection {
                                                 );
                                             }
 
-                                            // Add to global calls (without contact-specific secret)
+                                            if let Some(secret) =
+                                                call.secrets.read().await.get(&(user_id as u64))
+                                            {
+                                                base_call_map.insert(
+                                                    DataType::CallSecret.to_id(&tm),
+                                                    secret.to_data_value(),
+                                                );
+                                            }
+
+                                            // Add to global calls with only this user's recipient-specific secret.
                                             global_calls.push(DataValue::container_from_map(
                                                 &base_call_map,
                                             ));
@@ -218,19 +227,7 @@ impl GeneralConnection {
                                                     continue;
                                                 }
 
-                                                let mut contact_call_map = base_call_map.clone();
-
-                                                if let Some(secret) = call
-                                                    .secrets
-                                                    .read()
-                                                    .await
-                                                    .get(&(member_id, user_id as u64))
-                                                {
-                                                    contact_call_map.insert(
-                                                        DataType::CallSecret.to_id(&tm),
-                                                        DataValue::Str(secret.clone()),
-                                                    );
-                                                }
+                                                let contact_call_map = base_call_map.clone();
 
                                                 invites
                                                     .entry(member_id as i64)
diff --git a/src/rho/iota_connection.rs b/src/rho/iota_connection.rs
index 95956a4..b499875 100755
--- a/src/rho/iota_connection.rs
+++ b/src/rho/iota_connection.rs
@@ -433,7 +433,11 @@ impl IotaConnection {
                     base_call_map.insert(DataType::HasAdmin.to_id(&tm), DataValue::Bool(true));
                 }
 
-                // Add to global calls (without contact-specific secret)
+                if let Some(secret) = call.secrets.read().await.get(&user_id) {
+                    base_call_map.insert(DataType::CallSecret.to_id(&tm), secret.to_data_value());
+                }
+
+                // Add to global calls with only this user's recipient-specific secret.
                 global_calls.push(DataValue::container_from_map(&base_call_map));
 
                 // Attach this call to EVERY member of the call (other than ourselves)
@@ -443,15 +447,7 @@ impl IotaConnection {
                         continue;
                     }
 
-                    let mut contact_call_map = base_call_map.clone();
-
-                    // Add secret if it exists for this pairing
-                    if let Some(secret) = call.secrets.read().await.get(&(member_id, user_id)) {
-                        contact_call_map.insert(
-                            DataType::CallSecret.to_id(&tm),
-                            DataValue::Str(secret.clone()),
-                        );
-                    }
+                    let contact_call_map = base_call_map.clone();
 
                     invites
                         .entry(member_id as i64)
```
