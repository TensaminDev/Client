import type { ChatPickerMediaGroup } from "@tensamin/shared/data";

function withoutMedia(
  groups: ChatPickerMediaGroup[],
  url: string,
  keepGroupId?: string,
) {
  return groups
    .map((group) => ({
      ...group,
      media: group.media.filter((item) => item !== url),
    }))
    .filter((group) => group.id === keepGroupId || group.media.length > 0);
}

export function assignMediaToGroup(
  groups: ChatPickerMediaGroup[],
  groupId: string | null,
  url: string,
) {
  const nextGroups = withoutMedia(groups, url, groupId ?? undefined);

  if (groupId === null) return nextGroups;

  return nextGroups.map((group) =>
    group.id === groupId ? { ...group, media: [url, ...group.media] } : group,
  );
}

export function createMediaGroup(
  groups: ChatPickerMediaGroup[],
  id: string,
  name: string,
  url: string,
) {
  const trimmedName = name.trim();

  if (
    !trimmedName ||
    groups.some(
      (group) =>
        group.name.toLocaleLowerCase() === trimmedName.toLocaleLowerCase(),
    )
  ) {
    return groups;
  }

  return [
    ...withoutMedia(groups, url),
    { id, name: trimmedName, media: [url] },
  ];
}

export function getMediaGroupId(groups: ChatPickerMediaGroup[], url: string) {
  return groups.find((group) => group.media.includes(url))?.id ?? null;
}

export function getUngroupedMedia(
  savedMedia: string[],
  groups: ChatPickerMediaGroup[],
) {
  const groupedMedia = new Set(groups.flatMap((group) => group.media));

  return savedMedia.filter((url) => !groupedMedia.has(url));
}
