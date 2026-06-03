import * as React from 'react';
import * as ReactDom from 'react-dom';
import { Version } from '@microsoft/sp-core-library';
import {
  type IPropertyPaneConfiguration,
  PropertyPaneTextField,
  PropertyPaneToggle
} from '@microsoft/sp-property-pane';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';

import * as strings from 'DmsPortalWebPartStrings';
import DmsPortal from './components/DmsPortal';
import { IDmsPortalProps } from './components/IDmsPortalProps';
import { IDmsService } from './services/IDmsService';
import { MockDmsService } from './services/MockDmsService';
import { SharePointDmsService } from './services/SharePointDmsService';

export interface IDmsPortalWebPartProps {
  description: string;
  useMockData: boolean;        // toggle để fallback về mock khi dev/test
  dmsSiteUrl: string;          // URL site chứa DMS Library (cross-site support)
}

const DEFAULT_DMS_SITE_URL: string = 'https://biahalong.sharepoint.com/sites/vanbandieuhanh';

export default class DmsPortalWebPart extends BaseClientSideWebPart<IDmsPortalWebPartProps> {
  // Phase 2: dùng SharePoint Library "DMS Library" làm nguồn dữ liệu thật.
  // Nếu property useMockData = true thì fallback về mock (dev/preview mode).
  private _dmsService: IDmsService | undefined;

  private _getService(): IDmsService {
    if (!this._dmsService) {
      if (this.properties.useMockData) {
        this._dmsService = new MockDmsService();
      } else {
        const siteUrl: string = (this.properties.dmsSiteUrl && this.properties.dmsSiteUrl.trim().length > 0)
          ? this.properties.dmsSiteUrl.trim()
          : DEFAULT_DMS_SITE_URL;
        this._dmsService = new SharePointDmsService(this.context, siteUrl);
      }
    }
    return this._dmsService;
  }

  public render(): void {
    const element: React.ReactElement<IDmsPortalProps> = React.createElement(DmsPortal, {
      dmsService: this._getService(),
      hasTeamsContext: !!this.context.sdks.microsoftTeams,
      userDisplayName: this.context.pageContext.user.displayName
    });

    ReactDom.render(element, this.domElement);
  }

  protected onPropertyPaneFieldChanged(propertyPath: string, oldValue: unknown, newValue: unknown): void {
    if ((propertyPath === 'useMockData' || propertyPath === 'dmsSiteUrl') && oldValue !== newValue) {
      this._dmsService = undefined;  // clear cache để re-init service
      this.render();
    }
  }

  protected onDispose(): void {
    ReactDom.unmountComponentAtNode(this.domElement);
  }

  protected get dataVersion(): Version {
    return Version.parse('1.0');
  }

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    return {
      pages: [
        {
          header: {
            description: strings.PropertyPaneDescription
          },
          groups: [
            {
              groupName: strings.BasicGroupName,
              groupFields: [
                PropertyPaneTextField('description', {
                  label: strings.DescriptionFieldLabel
                }),
                PropertyPaneTextField('dmsSiteUrl', {
                  label: 'URL site chứa DMS Library',
                  description: 'Ví dụ: https://biahalong.sharepoint.com/sites/vanbandieuhanh',
                  placeholder: DEFAULT_DMS_SITE_URL
                }),
                PropertyPaneToggle('useMockData', {
                  label: 'Sử dụng dữ liệu mock (thay vì DMS Library)',
                  onText: 'Mock data',
                  offText: 'DMS Library thật'
                })
              ]
            }
          ]
        }
      ]
    };
  }
}
