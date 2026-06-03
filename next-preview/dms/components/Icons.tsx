'use client';
import * as React from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import { initializeIcons } from '@fluentui/react/lib/Icons';

// Register the Fluent UI (Fabric MDL2) icon set once for the whole web part.
initializeIcons(undefined, { disableWarnings: true });

export interface IIconProps {
  className?: string;
  size?: number;
}

/** Build a thin Fluent-icon wrapper that keeps our `{ size, className }` API. */
function makeIcon(iconName: string, defaultSize: number): (p: IIconProps) => React.ReactElement {
  const Cmp = (p: IIconProps): React.ReactElement => (
    <Icon iconName={iconName} className={p.className} style={{ fontSize: p.size ?? defaultSize }} />
  );
  Cmp.displayName = `${iconName}Icon`;
  return Cmp;
}

/** Same as makeIcon but with a fixed brand colour (file-type / product icons). */
function makeColoredIcon(
  iconName: string,
  color: string,
  defaultSize: number
): (p: IIconProps) => React.ReactElement {
  const Cmp = (p: IIconProps): React.ReactElement => (
    <Icon iconName={iconName} className={p.className} style={{ fontSize: p.size ?? defaultSize, color }} />
  );
  Cmp.displayName = `${iconName}ColorIcon`;
  return Cmp;
}

// ----- Navigation / chrome -----
export const HomeIcon = makeIcon('Home', 16);
export const SearchIcon = makeIcon('Search', 16);
export const FileNewIcon = makeIcon('PageAdd', 16);
export const UploadIcon = makeIcon('CloudUpload', 16);
export const ClockAlertIcon = makeIcon('Clock', 16);
export const BuildingIcon = makeIcon('Org', 16);
export const TagIcon = makeIcon('Tag', 16);
export const ChartIcon = makeIcon('BarChart4', 16);
export const SendIcon = makeIcon('Send', 16);
export const BookIcon = makeIcon('ReadingMode', 16);
export const TrashIcon = makeIcon('RecycleBin', 16);
export const EditIcon = makeIcon('Edit', 14);
export const StarIcon = makeIcon('FavoriteStar', 16);
export const ShareIcon = makeIcon('Share', 16);
export const ChevronDownIcon = makeIcon('ChevronDown', 14);
export const ArrowRightIcon = makeIcon('ChevronRightMed', 12);
export const DocLibraryIcon = makeIcon('DocumentManagement', 18);

// ----- Status / KPI -----
export const WarningIcon = makeIcon('Warning', 16);
export const CalendarIcon = makeIcon('Calendar', 14);
export const DocStackIcon = makeIcon('Documentation', 18);
export const CheckCircleIcon = makeIcon('CompletedSolid', 18);
export const XCircleIcon = makeIcon('StatusErrorFull', 18);
export const ClockIcon = makeIcon('Clock', 18);

// ----- Quick-filter pills -----
export const GavelIcon = makeIcon('Certificate', 16);
export const FlowIcon = makeIcon('Flow', 16);
export const MegaphoneIcon = makeIcon('Megaphone', 16);
export const MailIcon = makeIcon('Mail', 16);
export const GridIcon = makeIcon('GridViewSmall', 16);

// ----- File-type / product (brand-coloured) -----
export const PdfFileIcon = makeColoredIcon('PDF', '#D13438', 18);
export const WordFileIcon = makeColoredIcon('WordDocument', '#185ABD', 18);
export const TeamsIcon = makeColoredIcon('TeamsLogo', '#5059C9', 18);
