const assistantLog = (content) => {
  return `${content} (assistant)`;
};

const autoSettingLog = (content) => {
  return `${content} (auto setting)`;
};

const automationLog = (content) => {
  return `${content} (automation)`;
};

const apiLog = (content) => {
  return `${content} (api)`;
};

const campaignLog = (content) => {
  return `${content} (campaign)`;
};

const activityLog = (content, mode) => {
  let activity_content = 'sent video using email';

  switch (mode) {
    case 'automation':
      activity_content = `${content} (automation)`;
      break;
    case 'campaign':
      activity_content = `${content} (campaign)`;
      break;
    case 'api':
      activity_content = `${content} (api)`;
      break;
  }

  return activity_content;
};

module.exports = {
  assistantLog,
  autoSettingLog,
  automationLog,
  apiLog,
  campaignLog,
  activityLog,
};
