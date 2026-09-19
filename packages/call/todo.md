- Good preview page
Wait for backend implementation

- Make the Three-Dots button open a dialog/context-menu to configure the call for anonymous invites or other admin stuff
- Implement context menu features
  - Admin call actions
    - Timeout
    - Disconnect

- Anonymous invites
  - Generate random user id, have a NotReal bool.
    - Use user id as a seed for a randomly generated name and avatar and then make that get used for GetUserData, this way these fake users don't need to get synced across omegas or omikrons
    - Unreal users don't get customisation of their user data
