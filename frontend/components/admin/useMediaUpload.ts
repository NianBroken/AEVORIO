import { App } from "antd";
import type { ResourceRecord } from "../../../shared/content";
import { createId } from "../../lib/create-id";
import { api } from "./api";

// 图片上传携带归属字段，上传结果由同一回调进入当前编辑状态。
export function useMediaUpload(
  owner: Pick<ResourceRecord, "type" | "id">,
  onUploaded: (record: ResourceRecord) => void,
  onBusy: (busy: boolean) => void,
) {
  const { message } = App.useApp();
  return async (file: File, fieldKey: string): Promise<ResourceRecord | null> => {
    onBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("ownerType", owner.type);
      body.set("ownerId", owner.id);
      body.set("fieldKey", fieldKey);
      body.set("operationId", createId());
      const uploaded = await api<ResourceRecord>("/media/uploads", "POST", body);
      onUploaded(uploaded);
      message.success("图片已上传，可在当前字段中使用。");
      return uploaded;
    } catch (error) {
      message.error((error as Error).message);
      return null;
    } finally {
      onBusy(false);
    }
  };
}
