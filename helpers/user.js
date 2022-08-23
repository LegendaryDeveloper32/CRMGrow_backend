const User = require('../models/user');
const system_settings = require('../config/system_settings');

const setPackage = async (data) => {
  const { user, level } = data;

  // contact info
  const contact_info = {
    'contact_info.max_count': system_settings.CONTACT_UPLOAD_LIMIT[level],
  };

  let material_info;
  let automation_info;
  let calendar_info;
  let text_info;
  let assist_info;
  let capture_enabled;
  let link_track_enabled;
  let email_info;
  let team_info;

  if (level === 'ELITE') {
    material_info = {
      'material_info.is_limit': false,
      'material_info.record_max_duration':
        system_settings.VIDEO_RECORD_LIMIT[level],
    };
  } else {
    material_info = {
      'material_info.is_limit': true,
      'material_info.upload_max_count':
        system_settings.MATERIAL_UPLOAD_LIMIT[level],
      'material_info.record_max_duration':
        system_settings.VIDEO_RECORD_LIMIT[level],
    };
  }

  if (level === 'LITE') {
    automation_info = {
      'automation_info.is_enabled': false,
    };

    calendar_info = {
      'calendar_info.is_enabled': false,
    };

    text_info = {
      'text_info.is_enabled': false,
    };

    assist_info = {
      'assistant_info.is_enabled': false,
    };

    email_info = {
      'email_info.mass_enable': false,
    };

    team_info = {
      'team_info.owner_enabled': false,
    };

    capture_enabled = false;
    link_track_enabled = false;
  } else {
    automation_info = {
      'automation_info.is_enabled': true,
      'automation_info.max_count':
        system_settings.AUTOMATION_ASSIGN_LIMIT[level],
    };

    calendar_info = {
      'calendar_info.is_enabled': true,
      'calendar_info.max_count': system_settings.CALENDAR_LIMIT[level],
    };

    text_info = {
      'text_info.is_enabled': true,
      'text_info.max_count': system_settings.TEXT_MONTHLY_LIMIT[level],
    };

    assist_info = {
      'assistant_info.is_enabled': true,
      'assistant_info.max_count': system_settings.ASSISTANT_LIMIT[level],
    };

    email_info = {
      'email_info.mass_enable': true,
    };

    team_info = {
      'team_info.owner_enabled': true,
    };

    capture_enabled = true;
    link_track_enabled = true;
  }

  const query = {
    ...contact_info,
    ...material_info,
    ...automation_info,
    ...calendar_info,
    ...text_info,
    ...assist_info,
    ...email_info,
    ...team_info,
    capture_enabled,
    link_track_enabled,
  };

  console.log('query', query);

  return User.updateOne(
    {
      _id: user,
    },
    {
      $set: query,
    }
  );
};

module.exports = {
  setPackage,
};
