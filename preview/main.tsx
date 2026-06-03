import * as React from 'react';
import * as ReactDOM from 'react-dom';

// Reuse the exact same components SharePoint will run.
import DmsPortal from '../src/webparts/dmsPortal/components/DmsPortal';
import { MockDmsService } from '../src/webparts/dmsPortal/services/MockDmsService';

const container: HTMLElement | null = document.getElementById('root');

if (container) {
  ReactDOM.render(
    <DmsPortal
      dmsService={new MockDmsService()}
      hasTeamsContext={false}
      userDisplayName="Phạm Xuân Cường"
    />,
    container
  );
}
