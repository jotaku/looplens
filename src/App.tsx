import { Route, Switch } from 'wouter';
import { Layout } from '@/components/Layout';
import { OverviewPage } from '@/views/OverviewPage';
import { SessionsPage } from '@/views/SessionsPage';
import { SessionDetail } from '@/views/SessionDetail';
import { AgentsPage } from '@/views/AgentsPage';
import { ToolsPage } from '@/views/ToolsPage';
import { ModelsPage } from '@/views/ModelsPage';
import { CommitsPage } from '@/views/CommitsPage';
import { QualityPage } from '@/views/QualityPage';

export function App() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={OverviewPage} />
        <Route path="/sessions" component={SessionsPage} />
        <Route path="/sessions/:id">
          {(params) => <SessionDetail id={params.id} />}
        </Route>
        <Route path="/agents" component={AgentsPage} />
        <Route path="/tools" component={ToolsPage} />
        <Route path="/models" component={ModelsPage} />
        <Route path="/quality" component={QualityPage} />
        <Route path="/commits" component={CommitsPage} />
        <Route>
          <div className="text-text2 text-sm py-8">Page not found</div>
        </Route>
      </Switch>
    </Layout>
  );
}
