'use client';
import * as React from 'react';
import styles from './DmsPortal.module.scss';

/**
 * Banner cảnh báo người dùng rằng metadata hiện tại đang ở giai đoạn chuẩn hóa.
 * - Có thể dismiss (state lưu trong sessionStorage, KHÔNG dùng localStorage vì SPFx có restriction).
 * - Hiển thị 1 lần cho mỗi session; sau khi đóng sẽ ẩn tới khi user reload.
 */

const DISMISS_KEY: string = 'dms-portal-disclaimer-dismissed';

export interface IDisclaimerBannerProps {
  message?: string;
}

export default function DisclaimerBanner(props: IDisclaimerBannerProps): React.ReactElement {
  const defaultMsg: string =
    'Dữ liệu đang trong giai đoạn chuẩn hóa. Một số metadata (loại văn bản, đơn vị soạn thảo, người ký) có thể chưa phản ánh đầy đủ nội dung văn bản.';

  const [dismissed, setDismissed] = React.useState<boolean>(false);

  React.useEffect((): void => {
    try {
      const stored: string | null = window.sessionStorage.getItem(DISMISS_KEY);
      if (stored === '1') {
        setDismissed(true);
      }
    } catch {
      // sessionStorage có thể bị block trong 1 số iframe context — bỏ qua
    }
  }, []);

  if (dismissed) {
    return <React.Fragment />;
  }

  const handleDismiss = (): void => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // bỏ qua
    }
  };

  return (
    <div className={styles.disclaimerBanner} role="status">
      <span className={styles.disclaimerIcon} aria-hidden={true}>ⓘ</span>
      <span className={styles.disclaimerText}>{props.message ?? defaultMsg}</span>
      <button
        type="button"
        className={styles.disclaimerClose}
        onClick={handleDismiss}
        aria-label="Đóng thông báo"
        title="Đóng"
      >
        ×
      </button>
    </div>
  );
}
