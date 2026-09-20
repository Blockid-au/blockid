/**
 * /vi/methodology/governance — Vietnamese mirror of the score-governance page
 * (G21 P0-D). A short translated summary sits above the same English
 * sections; the institutional document itself is English.
 */

import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/page-meta";
import { GovernanceBody } from "../../../(marketing)/methodology/governance/governance-body";
import { GOVERNANCE_VI_PATH, buildGovernanceProps } from "../../../(marketing)/methodology/governance/governance-content";

export const revalidate = 3600;

const VI_SUMMARY = {
  title: "Quản trị điểm số — tóm tắt",
  paragraphs: [
    "Startup Value Index là một đánh giá xác định, có trọng số theo bằng chứng, trên tám chiều kinh doanh. Mọi công ty trong một cohort, một pipeline hay một chỉ số đều được đánh giá trên cùng một khung, cùng quy tắc bằng chứng, tại mọi thời điểm.",
    "Trọng số cố định theo phiên bản phương pháp và luôn bằng 100; phiên bản được lưu trên mọi báo cáo và mọi snapshot, báo cáo cũ không bao giờ bị chấm lại âm thầm. Thay đổi trọng số hay tiêu chí là bản minor; thay đổi bộ chiều là bản major và khách hàng tổ chức được thông báo bằng văn bản trước khi triển khai.",
    "Phân vị chỉ được công bố khi tập so sánh đủ lớn (dưới 10: không hiển thị; 10–29: “tham khảo”; 30 trở lên: cơ bản; 100 trở lên: phân đoạn) và luôn kèm n. Xung đột giữa tuyên bố và bằng chứng không bao giờ được lấy trung bình hay che giấu; giá trị có độ tin cậy cao hơn được dùng và xung đột được hiển thị.",
    "BlockID cấu trúc bằng chứng và chuẩn hoá phân tích vòng đầu. Con người ra quyết định. Mọi can thiệp của người xét duyệt hay ghi đè đều được ghi vào nhật ký kiểm toán chuỗi băm, không bao giờ âm thầm.",
  ],
  fullVersionNote: "Tài liệu quản trị đầy đủ bằng tiếng Anh nằm bên dưới; bản tiếng Anh là bản có hiệu lực.",
};

export async function generateMetadata(): Promise<Metadata> {
  const p = buildGovernanceProps();
  return pageMetadata({
    title: "Quản trị điểm số",
    description: `Cách Startup Value Index (v${p.version}) được quản trị: các chiều, trọng số, phiên bản, quy tắc phân vị, xung đột, xét duyệt bởi con người, chỉnh sửa và chấm lại.`,
    path: GOVERNANCE_VI_PATH,
    viPath: GOVERNANCE_VI_PATH,
    lang: "vi",
  });
}

export default function ViGovernanceRoute() {
  return <GovernanceBody {...buildGovernanceProps()} locale="vi" summary={VI_SUMMARY} methodologyHref="/vi/methodology" />;
}
