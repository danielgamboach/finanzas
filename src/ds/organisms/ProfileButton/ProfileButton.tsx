import React from 'react';
import { Avatar } from '../../atoms/Avatar/Avatar';
import { Badge } from '../../atoms/Badge/Badge';
import { Icon } from '../../atoms/Icon/Icon';
import './ProfileButton.css';

/** Top left on Inicio: the current space (emoji and name) and a chevron; opens the profile menu. The dot says there are payments to confirm. */
export function ProfileButton({ emoji, name, space, color = 'mint-subtle', dot, dotLabel, onClick }: { emoji: string; name: string; space?: React.ReactNode; color?: string; dot?: boolean; dotLabel?: string; onClick?: () => void }) {
  return (
    <button type="button" className="ds-profile" onClick={onClick} aria-haspopup="dialog">
      <Avatar emoji={emoji} size="sm" color={color} />
      <span className="ds-profile__names">
        <span className="ds-profile__name">{name}<Icon name="chevDown" size={12} /></span>
        {space && <span className="ds-profile__space">{space}</span>}
      </span>
      {dot && <Badge dot className="ds-profile__dot" aria-label={dotLabel} role="img" />}
    </button>
  );
}
