# Ring of Kerry Tours 🍀

AI-powered personalized trip planning for the Ring of Kerry, Ireland.

## Features

- **Personalized Itineraries**: Custom 1-7 day trip plans based on your interests, budget, and preferences
- **AI-Powered**: Uses Claude AI to create detailed, practical travel recommendations
- **Weather-Aware**: Includes backup plans and seasonal considerations
- **Accessibility-Friendly**: Considers mobility needs and special requirements
- **Interactive Refinement**: Easily customize your itinerary based on feedback
- **Mobile-Responsive**: Works perfectly on all devices

## Technology Stack

- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Netlify Functions (Node.js)
- **Database**: Supabase (PostgreSQL)
- **AI**: Anthropic Claude API
- **Hosting**: Netlify
- **Domain**: Custom domain with SSL

## Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/ring-of-kerry-tours.git
   cd ring-of-kerry-tours
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file with:
   ```
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_SERVICE_KEY=your_supabase_service_key
   ANTHROPIC_API_KEY=your_claude_api_key
   ```

4. **Run locally**
   ```bash
   npm run dev
   ```

## Deployment

This project is designed to deploy automatically to Netlify:

1. Connect your GitHub repository to Netlify
2. Add environment variables in Netlify dashboard
3. Deploy automatically on every push to main branch

## Environment Variables

Required environment variables for production:

- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_KEY`: Your Supabase service role key
- `ANTHROPIC_API_KEY`: Your Claude API key from Anthropic

## Project Structure

```
├── public/                 # Static website files
│   ├── index.html         # Homepage
│   └── planner/           # Trip planner pages
├── netlify/functions/     # Serverless API functions
├── src/utils/            # Shared utilities
├── netlify.toml          # Netlify configuration
└── package.json          # Dependencies and scripts
```

## API Endpoints

- `POST /.netlify/functions/generate-itinerary` - Generate new itinerary
- `POST /.netlify/functions/refine-itinerary` - Refine existing itinerary
- `GET /.netlify/functions/get-itinerary/{id}` - Retrieve saved itinerary

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For support or questions, contact: hello@ringofkerrytours.com

---

Made with ❤️ for Irish adventures